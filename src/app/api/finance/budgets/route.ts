import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { getDefaultCurrency } from "@/modules/finance/server/settings";
import { withErrors } from "@/lib/api-errors";

const upsertSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/), // major units, default currency; "0" clears
});

/** Upsert the open-ended monthly budget for a category (one active budget per category). */
export const POST = withErrors(async (req: NextRequest) => {
  const parsed = upsertSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { categoryId, amount } = parsed.data;
  const def = await getDefaultCurrency();
  const exponent =
    (await prisma.currency.findUnique({ where: { code: def } }))?.exponent ?? 3;
  const minor = parseAmount(amount, exponent);
  const month = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 7);

  const existing = await prisma.budget.findFirst({
    where: { categoryId, endMonth: null },
  });

  if (minor === 0) {
    if (existing) await prisma.budget.delete({ where: { id: existing.id } });
    return NextResponse.json({ cleared: true });
  }

  const budget = existing
    ? await prisma.budget.update({
        where: { id: existing.id },
        data: { amountDefaultMinor: BigInt(minor) },
      })
    : await prisma.budget.create({
        data: {
          categoryId,
          amountDefaultMinor: BigInt(minor),
          startMonth: month,
        },
      });
  return NextResponse.json(jsonSafe(budget), { status: existing ? 200 : 201 });
});
