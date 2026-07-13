import { NextRequest, NextResponse } from "next/server";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, parseAmount } from "@/lib/money";
import { transactionUpdateSchema } from "@/lib/schemas/finance";
import { loadFxContext } from "@/modules/finance/server/fx";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = transactionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const [existing, fx] = await Promise.all([
    prisma.transaction.findUnique({ where: { id } }),
    loadFxContext(),
  ]);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const exponent = fx.currencies.get(existing.currencyCode)?.exponent ?? 2;

  const amountMinor =
    input.amount !== undefined
      ? parseAmount(input.amount, exponent)
      : Number(existing.amountMinor);
  const rate =
    input.fxRateToDefault !== undefined
      ? new Decimal(input.fxRateToDefault)
      : new Decimal(existing.fxRateToDefault.toString());
  const amountDefaultMinor = convertMinor(amountMinor, rate, exponent, fx.defExponent);

  const txn = await prisma.transaction.update({
    where: { id },
    data: {
      amountMinor: BigInt(amountMinor),
      fxRateToDefault: rate.toString(),
      amountDefaultMinor: BigInt(amountDefaultMinor),
      categoryId: input.categoryId,
      date: input.date,
      note: input.note,
    },
  });
  return NextResponse.json(jsonSafe(txn));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.transferGroupId) {
    // delete both legs of a transfer
    await prisma.transaction.deleteMany({
      where: { transferGroupId: existing.transferGroupId },
    });
  } else {
    await prisma.transaction.delete({ where: { id } });
  }
  return NextResponse.json({ deleted: true });
}
