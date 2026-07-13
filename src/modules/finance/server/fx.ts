import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { crossRate } from "@/lib/money";
import { getDefaultCurrency } from "./settings";

export const FX_STALE_DAYS = 3;

/**
 * Rates are stored base=defaultCurrency (1 KWD = rate QUOTE), one row per day.
 * getRateToDefault returns: 1 unit of `currency` = ? units of default currency.
 */
export async function getRateToDefault(
  currency: string,
): Promise<{ rate: Decimal; asOfDate: string | null; stale: boolean }> {
  const def = await getDefaultCurrency();
  if (currency === def) return { rate: new Decimal(1), asOfDate: null, stale: false };

  const row = await prisma.fxRate.findFirst({
    where: { base: def, quote: currency },
    orderBy: { asOfDate: "desc" },
  });
  if (!row) return { rate: new Decimal(0), asOfDate: null, stale: true };

  // stored: 1 DEF = rate CUR → invert
  const rate = new Decimal(1).div(new Decimal(row.rate.toString()));
  const ageDays =
    (Date.now() - new Date(row.asOfDate + "T00:00:00Z").getTime()) / 86_400_000;
  return { rate, asOfDate: row.asOfDate, stale: ageDays > FX_STALE_DAYS };
}

/** Rate between two arbitrary currencies via the default-currency cross. */
export async function getRate(from: string, to: string): Promise<Decimal> {
  if (from === to) return new Decimal(1);
  const [f, t] = [await getRateToDefault(from), await getRateToDefault(to)];
  if (f.rate.isZero() || t.rate.isZero()) throw new Error(`No FX rate for ${from}→${to}`);
  // f.rate: 1 from = f DEF; t.rate: 1 to = t DEF → 1 from = f/t to
  return crossRate(t.rate, f.rate) as Decimal;
}

/** Fetch latest daily rates (base = default currency) and upsert into fx_rates. */
export async function refreshFxRates(): Promise<{ asOfDate: string; count: number }> {
  const def = await getDefaultCurrency();
  const active = await prisma.currency.findMany({ where: { isFiat: true, isActive: true } });
  const wanted = active.map((c) => c.code).filter((c) => c !== def);

  const rates = await fetchRates(def);
  const asOfDate = rates.date;
  let count = 0;
  for (const code of wanted) {
    const r = rates.rates[code];
    if (r === undefined) continue;
    await prisma.fxRate.upsert({
      where: { base_quote_asOfDate: { base: def, quote: code, asOfDate } },
      update: { rate: r.toString() },
      create: { base: def, quote: code, rate: r.toString(), asOfDate },
    });
    count++;
  }
  return { asOfDate, count };
}

interface RatesResult {
  date: string;
  rates: Record<string, number>;
}

async function fetchRates(base: string): Promise<RatesResult> {
  // Primary: open.er-api.com (free, no key, includes KWD)
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result === "success" && data.rates) {
        const date = new Date(data.time_last_update_unix * 1000)
          .toISOString()
          .slice(0, 10);
        return { date, rates: data.rates };
      }
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: frankfurter.dev (ECB — no KWD base; use USD base and cross)
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("All FX providers failed");
  const data = await res.json();
  const baseInUsd = base === "USD" ? 1 : data.rates[base];
  if (!baseInUsd) throw new Error(`FX fallback cannot price base ${base}`);
  const rates: Record<string, number> = {};
  for (const [code, perUsd] of Object.entries<number>(data.rates)) {
    rates[code] = perUsd / baseInUsd;
  }
  rates["USD"] = 1 / baseInUsd;
  return { date: data.date, rates };
}
