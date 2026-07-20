import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { accountCreateSchema } from "@/lib/schemas/finance";
import { computeBalances } from "@/modules/finance/server/balances";
import { withErrors } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  // ?archived=1 lists archived accounts (no balances — for the restore UI)
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({
      where: { archivedAt: archived ? { not: null } : null },
      include: { currency: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    archived ? [] : computeBalances(),
  ]);
  const balanceMap = new Map(balances.map((b) => [b.accountId, b]));
  const result = accounts.map((a) => ({
    ...a,
    balance: balanceMap.get(a.id) ?? null,
  }));
  return NextResponse.json(jsonSafe(result));
}

export const POST = withErrors(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = accountCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const currency = await prisma.currency.findUnique({ where: { code: input.currencyCode } });
  if (!currency) {
    return NextResponse.json({ error: "Unknown currency" }, { status: 400 });
  }

  const account = await prisma.account.create({
    data: {
      name: input.name,
      kind: input.kind,
      subtype: input.subtype,
      currencyCode: input.currencyCode,
      isLiability: input.isLiability,
      includeInNetWorth: input.includeInNetWorth,
      openingBalanceMinor: input.openingBalance
        ? BigInt(parseAmount(input.openingBalance, currency.exponent)) *
          (input.isLiability ? -1n : 1n)
        : 0n,
      assetSymbol: input.assetSymbol,
      quantity: input.quantity,
      priceSource: input.priceSource,
      manualPriceMinor: input.manualPrice
        ? BigInt(parseAmount(input.manualPrice, currency.exponent))
        : null,
      icon: input.icon,
      mask: input.mask,
      sortOrder: input.sortOrder,
    },
  });
  return NextResponse.json(jsonSafe(account), { status: 201 });
});
