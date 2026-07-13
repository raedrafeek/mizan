import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { loadFxContext } from "@/modules/finance/server/fx";

export const dynamic = "force-dynamic";

export async function GET() {
  const [currencies, fx] = await Promise.all([
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    loadFxContext(),
  ]);
  const rates: Record<string, { rate: string; stale: boolean; asOfDate: string | null }> = {};
  for (const c of currencies) {
    if (!c.isFiat) continue;
    const info = fx.rateToDefault(c.code);
    rates[c.code] = { rate: info.rate.toString(), stale: info.stale, asOfDate: info.asOfDate };
  }
  return NextResponse.json(jsonSafe({ currencies, defaultCurrency: fx.def, rates }));
}
