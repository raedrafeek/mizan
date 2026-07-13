import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { getDefaultCurrency } from "@/modules/finance/server/settings";
import { getRateToDefault } from "@/modules/finance/server/fx";

export async function GET() {
  const [currencies, defaultCurrency] = await Promise.all([
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    getDefaultCurrency(),
  ]);
  const rates: Record<string, { rate: string; stale: boolean; asOfDate: string | null }> = {};
  for (const c of currencies) {
    if (!c.isFiat) continue;
    const fx = await getRateToDefault(c.code);
    rates[c.code] = { rate: fx.rate.toString(), stale: fx.stale, asOfDate: fx.asOfDate };
  }
  return NextResponse.json(jsonSafe({ currencies, defaultCurrency, rates }));
}
