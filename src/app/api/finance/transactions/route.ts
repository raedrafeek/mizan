import { NextRequest, NextResponse } from "next/server";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, parseAmount } from "@/lib/money";
import { transactionCreateSchema } from "@/lib/schemas/finance";
import { loadFxContext } from "@/modules/finance/server/fx";
import { buildTransferLegs } from "@/modules/finance/server/transfers";
import { withErrors } from "@/lib/api-errors";
import { kuwaitToday } from "@/lib/dates";

export const GET = withErrors(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  // garbage params must degrade to defaults, not crash Prisma with NaN/bad ids
  const takeRaw = Number(sp.get("take") ?? 50);
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(1, Math.floor(takeRaw)), 200) : 50;
  const cursorRaw = sp.get("cursor");
  const cursor = cursorRaw && /^[a-z0-9]+$/i.test(cursorRaw) ? cursorRaw : null;
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
});

export const POST = withErrors(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = transactionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // server-side guard: no future-dated transactions (UI blocks them too)
  if (input.date > kuwaitToday()) {
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
    const counterExponent = fx.currencies.get(counter.currencyCode)?.exponent ?? 2;
    const legs = buildTransferLegs(fx, account, counter, amountMinor, {
      date: input.date,
      note: input.note,
      // caller-provided actual credit wins; else mid-market estimate
      counterAmountMinor: input.counterAmount
        ? parseAmount(input.counterAmount, counterExponent)
        : undefined,
      fromRateOverride: rate,
    });
    if (!legs.ok) return NextResponse.json({ error: legs.error }, { status: legs.status });
    const [out] = await prisma.$transaction([
      prisma.transaction.create({ data: legs.outData }),
      prisma.transaction.create({ data: legs.inData }),
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
});
