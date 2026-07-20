import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { accountUpdateSchema } from "@/lib/schemas/finance";
import { withErrors } from "@/lib/api-errors";

export const PATCH = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const existing = await prisma.account.findUnique({
    where: { id },
    include: { currency: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // changing the currency under existing transactions would mix currencies in
  // the balance sum — allowed only while the account has no history
  if (input.currencyCode && input.currencyCode !== existing.currencyCode) {
    const txnCount = await prisma.transaction.count({ where: { accountId: id } });
    if (txnCount > 0) {
      return NextResponse.json(
        { error: "Can't change the currency of an account that already has transactions" },
        { status: 400 },
      );
    }
  }

  const exponent = input.currencyCode
    ? (await prisma.currency.findUnique({ where: { code: input.currencyCode } }))?.exponent
    : existing.currency.exponent;
  if (exponent === undefined) {
    return NextResponse.json({ error: "Unknown currency" }, { status: 400 });
  }

  const account = await prisma.account.update({
    where: { id },
    data: {
      name: input.name,
      subtype: input.subtype,
      currencyCode: input.currencyCode,
      isLiability: input.isLiability,
      includeInNetWorth: input.includeInNetWorth,
      // same sign convention as create: liabilities store the owed amount negative
      openingBalanceMinor:
        input.openingBalance !== undefined
          ? BigInt(parseAmount(input.openingBalance, exponent)) *
            ((input.isLiability ?? existing.isLiability) ? -1n : 1n)
          : undefined,
      assetSymbol: input.assetSymbol,
      quantity: input.quantity,
      priceSource: input.priceSource,
      manualPriceMinor:
        input.manualPrice !== undefined
          ? BigInt(parseAmount(input.manualPrice, exponent))
          : undefined,
      icon: input.icon,
      mask: input.mask,
      sortOrder: input.sortOrder,
      archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
    },
  });
  return NextResponse.json(jsonSafe(account));
});

export const DELETE = withErrors(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const txnCount = await prisma.transaction.count({ where: { accountId: id } });
  if (txnCount > 0) {
    // soft-delete accounts that have history
    await prisma.account.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ archived: true });
  }
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
});
