import { NextRequest, NextResponse } from "next/server";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, parseAmount } from "@/lib/money";
import { transactionCreateSchema } from "@/lib/schemas/finance";
import { getRateToDefault } from "@/modules/finance/server/fx";
import { getDefaultCurrency } from "@/modules/finance/server/settings";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const take = Math.min(Number(sp.get("take") ?? 50), 200);
  const cursor = sp.get("cursor");
  const accountId = sp.get("accountId") ?? undefined;
  const month = sp.get("month") ?? undefined; // "2026-07"

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      ...(month ? { date: { startsWith: month } } : {}),
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

  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
    include: { currency: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });
  if (account.kind === "priced") {
    return NextResponse.json(
      { error: "Priced accounts are not transacted — edit the quantity instead" },
      { status: 400 },
    );
  }

  const def = await getDefaultCurrency();
  const defExponent =
    (await prisma.currency.findUnique({ where: { code: def } }))?.exponent ?? 3;
  const amountMinor = parseAmount(input.amount, account.currency.exponent);

  // freeze the FX rate at entry (manual override wins)
  let rate: Decimal;
  if (input.fxRateToDefault) {
    rate = new Decimal(input.fxRateToDefault);
  } else {
    const fx = await getRateToDefault(account.currencyCode);
    if (fx.rate.isZero()) {
      return NextResponse.json(
        { error: `No FX rate cached for ${account.currencyCode}. Run the FX refresh or enter a manual rate.` },
        { status: 409 },
      );
    }
    rate = fx.rate;
  }
  const amountDefaultMinor = convertMinor(
    amountMinor,
    rate,
    account.currency.exponent,
    defExponent,
  );

  // --- transfers create both legs atomically ---
  if (input.type === "transfer_out" || input.type === "transfer_in") {
    if (!input.counterAccountId) {
      return NextResponse.json({ error: "Transfer needs counterAccountId" }, { status: 400 });
    }
    const counter = await prisma.account.findUnique({
      where: { id: input.counterAccountId },
      include: { currency: true },
    });
    if (!counter || counter.kind === "priced") {
      return NextResponse.json({ error: "Invalid counter account" }, { status: 400 });
    }
    // counter-leg amount in the counter account's currency
    const counterFx = await getRateToDefault(counter.currencyCode);
    if (counterFx.rate.isZero()) {
      return NextResponse.json(
        { error: `No FX rate cached for ${counter.currencyCode}` },
        { status: 409 },
      );
    }
    const counterAmountMinor = convertMinor(
      amountDefaultMinor,
      new Decimal(1).div(counterFx.rate),
      defExponent,
      counter.currency.exponent,
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
          fxRateToDefault: counterFx.rate.toString(),
          amountDefaultMinor: BigInt(amountDefaultMinor),
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
