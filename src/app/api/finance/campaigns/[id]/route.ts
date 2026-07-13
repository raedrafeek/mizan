import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { campaignUpdateSchema } from "@/lib/schemas/finance";
import { getDefaultCurrency } from "@/modules/finance/server/settings";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = campaignUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const def = await getDefaultCurrency();
  const exp = (await prisma.currency.findUnique({ where: { code: def } }))?.exponent ?? 3;

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      name: input.name,
      targetDefaultMinor:
        input.target !== undefined ? BigInt(parseAmount(input.target, exp)) : undefined,
      targetDate: input.targetDate,
      linkedAccountId: input.linkedAccountId,
      manualProgressMinor:
        input.manualProgress === undefined
          ? undefined
          : input.manualProgress === null
            ? null
            : BigInt(parseAmount(input.manualProgress, exp)),
      status: input.status,
    },
  });
  return NextResponse.json(jsonSafe(campaign));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
