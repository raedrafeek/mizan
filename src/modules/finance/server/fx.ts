import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { getDefaultCurrency } from "./settings";

export const FX_STALE_DAYS = 3;

export interface FxInfo {
  rate: Decimal; // 1 unit of currency = rate units of default currency
  asOfDate: string | null;
  stale: boolean;
}

export interface CurrencyInfo {
  code: string;
  exponent: number;
  symbol: string;
  isFiat: boolean;
}

/**
 * Per-request FX context. Loads settings, currencies, and the latest FX rate
 * per pair in ONE parallel round-trip, then answers rate lookups from memory.
 * Every service/route should load this once and pass it down — per-lookup DB
 * queries were the source of multi-second N+1 latency.
 */
export interface FxContext {
  def: string;
  defExponent: number;
  currencies: Map<string, CurrencyInfo>;
  rateToDefault(code: string): FxInfo;
}

export async function loadFxContext(): Promise<FxContext> {
  const [settingRow, currencies, fxRows] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "defaultCurrency" } }),
    prisma.currency.findMany({ where: { isActive: true } }),
    prisma.$queryRaw<{ base: string; quote: string; rate: string; asOfDate: string }[]>`
      SELECT DISTINCT ON (base, quote) base, quote, rate::text AS rate, "asOfDate"
      FROM fx_rates
      ORDER BY base, quote, "asOfDate" DESC`,
  ]);

  const def = settingRow ? (JSON.parse(settingRow.valueJson) as string) : "KWD";
  const currencyMap = new Map<string, CurrencyInfo>(
    currencies.map((c) => [
      c.code,
      { code: c.code, exponent: c.exponent, symbol: c.symbol, isFiat: c.isFiat },
    ]),
  );
  const rateMap = new Map(fxRows.filter((r) => r.base === def).map((r) => [r.quote, r]));
  const one: FxInfo = { rate: new Decimal(1), asOfDate: null, stale: false };

  return {
    def,
    defExponent: currencyMap.get(def)?.exponent ?? 3,
    currencies: currencyMap,
    rateToDefault(code: string): FxInfo {
      if (code === def) return one;
      const row = rateMap.get(code);
      if (!row) return { rate: new Decimal(0), asOfDate: null, stale: true };
      // stored: 1 DEF = rate CODE → invert
      const ageDays =
        (Date.now() - new Date(row.asOfDate + "T00:00:00Z").getTime()) / 86_400_000;
      return {
        rate: new Decimal(1).div(new Decimal(row.rate)),
        asOfDate: row.asOfDate,
        stale: ageDays > FX_STALE_DAYS,
      };
    },
  };
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
