import { NextRequest, NextResponse } from "next/server";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, parseAmount } from "@/lib/money";
import { transactionCreateSchema } from "@/lib/schemas/finance";
import { loadFxContext } from "@/modules/finance/server/fx";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const take = Math.min(Number(sp.get("take") ?? 50), 200);
  const cursor = sp.get("cursor");
  const accountId = sp.get("accountId") ?? undefined;
  const month = sp.get("month") ?? undefined; // "2026-07"
  const categoryId = sp.get("categoryId") ?? undefined;
  const q = sp.get("q")?.trim() || undefined; // free-text note search

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      categoryId,
      ...(month ? { date: { startsWith: month } } : {}),
      ...(q ? { note: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { category: true, account: { select: { name: true, currencyCode: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > take;
  const page = hasMore ? transactions.slice(0, take) : transactions;
  return NextResponse.json(
    jsonSafe({ items: page, nextCursor: hasMore ? page[page.length - 1].id : null }),
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = transactionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // server-side guard: no future-dated transactions (UI blocks them too)
  const kuwaitToday = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  if (input.date > kuwaitToday) {
    return NextResponse.json(
      { error: `Date ${input.date} is in the future` },
      { status: 400 },
    );
  }

  const [account, fx] = await Promise.all([
    prisma.account.findUnique({ where: { id: input.accountId } }),
    loadFxContext(),
  ]);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });
  if (account.kind === "priced") {
    return NextResponse.json(
      { error: "Priced accounts are not transacted — edit the quantity instead" },
      { status: 400 },
    );
  }
  const exponent = fx.currencies.get(account.currencyCode)?.exponent ?? 2;
  const amountMinor = parseAmount(input.amount, exponent);

  // freeze the FX rate at entry (manual override wins)
  let rate: Decimal;
  if (input.fxRateToDefault) {
    rate = new Decimal(input.fxRateToDefault);
  } else {
    const info = fx.rateToDefault(account.currencyCode);
    if (info.rate.isZero()) {
      return NextResponse.json(
        { error: `No FX rate cached for ${account.currencyCode}. Run the FX refresh or enter a manual rate.` },
        { status: 409 },
      );
    }
    rate = info.rate;
  }
  const amountDefaultMinor = convertMinor(amountMinor, rate, exponent, fx.defExponent);

  // --- transfers create both legs atomically ---
  if (input.type === "transfer_out" || input.type === "transfer_in") {
    if (!input.counterAccountId) {
      return NextResponse.json({ error: "Transfer needs counterAccountId" }, { status: 400 });
    }
    const counter = await prisma.account.findUnique({
      where: { id: input.counterAccountId },
    });
    if (!counter || counter.kind === "priced") {
      return NextResponse.json({ error: "Invalid counter account" }, { status: 400 });
    }
    const counterInfo = fx.rateToDefault(counter.currencyCode);
    if (counterInfo.rate.isZero()) {
      return NextResponse.json(
        { error: `No FX rate cached for ${counter.currencyCode}` },
        { status: 409 },
      );
    }
    const counterExponent = fx.currencies.get(counter.currencyCode)?.exponent ?? 2;
    // received amount: caller-provided actual credit wins; else mid-market estimate
    const counterAmountMinor = input.counterAmount
      ? parseAmount(input.counterAmount, counterExponent)
      : convertMinor(
          amountDefaultMinor,
          new Decimal(1).div(counterInfo.rate),
          fx.defExponent,
          counterExponent,
        );
    // each leg carries its OWN default-currency value (difference = implicit fee/spread)
    const counterDefaultMinor = convertMinor(
      counterAmountMinor,
      counterInfo.rate,
      counterExponent,
      fx.defExponent,
    );
    const groupId = crypto.randomUUID();
    const [out] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          accountId: account.id,
          type: "transfer_out",
          amountMinor: BigInt(amountMinor),
          currencyCode: account.currencyCode,
          fxRateToDefault: rate.toString(),
          amountDefaultMinor: BigInt(amountDefaultMinor),
          date: input.date,
          note: input.note,
          transferGroupId: groupId,
        },
      }),
      prisma.transaction.create({
        data: {
          accountId: counter.id,
          type: "transfer_in",
          amountMinor: BigInt(counterAmountMinor),
          currencyCode: counter.currencyCode,
          fxRateToDefault: counterInfo.rate.toString(),
          amountDefaultMinor: BigInt(counterDefaultMinor),
          date: input.date,
          note: input.note,
          transferGroupId: groupId,
        },
      }),
    ]);
    return NextResponse.json(jsonSafe(out), { status: 201 });
  }

  const txn = await prisma.transaction.create({
    data: {
      accountId: account.id,
      type: input.type,
      amountMinor: BigInt(amountMinor),
      currencyCode: account.currencyCode,
      fxRateToDefault: rate.toString(),
      amountDefaultMinor: BigInt(amountDefaultMinor),
      categoryId: input.categoryId,
      date: input.date,
      note: input.note,
    },
  });
  return NextResponse.json(jsonSafe(txn), { status: 201 });
}
