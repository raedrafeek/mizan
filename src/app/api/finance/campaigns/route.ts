import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { campaignCreateSchema } from "@/lib/schemas/finance";
import { computeBalances } from "@/modules/finance/server/balances";
import { getDefaultCurrency } from "@/modules/finance/server/settings";
import { withErrors } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

async function defaultExponent(): Promise<number> {
  const def = await getDefaultCurrency();
  return (await prisma.currency.findUnique({ where: { code: def } }))?.exponent ?? 3;
}

/** GET: campaigns with computed progress + pace. */
export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["active", "paused"] } },
    orderBy: { createdAt: "asc" },
  });
  const needsBalances = campaigns.some((c) => c.linkedAccountId);
  const balances = needsBalances ? await computeBalances() : [];
  const balanceMap = new Map(balances.map((b) => [b.accountId, b.balanceDefaultMinor]));

  const today = Date.now();
  const result = campaigns.map((c) => {
    const progressMinor = c.linkedAccountId
      ? Math.max(0, balanceMap.get(c.linkedAccountId) ?? 0)
      : Number(c.manualProgressMinor ?? 0n);
    const target = Number(c.targetDefaultMinor);
    const pct = target > 0 ? Math.min(100, (progressMinor / target) * 100) : 0;

    // pace: where progress "should" be by now, linearly from creation to target date
    let pacePct: number | null = null;
    if (c.targetDate && c.status === "active") {
      const start = c.createdAt.getTime();
      const end = new Date(c.targetDate + "T00:00:00Z").getTime();
      if (end > start) {
        pacePct = Math.min(100, Math.max(0, ((today - start) / (end - start)) * 100));
      }
    }
    return { ...c, progressMinor, pct: Math.round(pct), pacePct };
  });
  return NextResponse.json(jsonSafe(result));
}

export const POST = withErrors(async (req: NextRequest) => {
  const parsed = campaignCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const exp = await defaultExponent();
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      targetDefaultMinor: BigInt(parseAmount(input.target, exp)),
      targetDate: input.targetDate,
      linkedAccountId: input.linkedAccountId,
      manualProgressMinor: input.manualProgress
        ? BigInt(parseAmount(input.manualProgress, exp))
        : null,
    },
  });
  return NextResponse.json(jsonSafe(campaign), { status: 201 });
});
