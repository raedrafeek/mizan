import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { convertMinor, holdingValueMinor } from "@/lib/money";
import { loadFxContext, type FxContext } from "./fx";

export interface AccountBalance {
  accountId: string;
  /** balance in the account's own currency, minor units (negative for liabilities in debt) */
  balanceMinor: number;
  currencyCode: string;
  /** balance converted to default currency, minor units */
  balanceDefaultMinor: number;
  stale: boolean;
  /** priced accounts: "missing" = no quote ever fetched (bad symbol / new) — value is 0! */
  priceStatus: "ok" | "stale" | "missing" | null;
  isLiability: boolean;
  includeInNetWorth: boolean;
}

/**
 * Balances for all non-archived accounts. Exactly two parallel round-trips:
 * the FxContext (settings+currencies+rates) and the account/sum/quote batch.
 */
export async function computeBalances(ctx?: FxContext): Promise<AccountBalance[]> {
  const fx = ctx ?? (await loadFxContext());

  const [accounts, sums, quoteRows] = await Promise.all([
    prisma.account.findMany({ where: { archivedAt: null } }),
    prisma.$queryRaw<{ accountId: string; total: bigint | null }[]>`
      SELECT "accountId",
             SUM(CASE WHEN type IN ('expense','transfer_out') THEN -"amountMinor"
                      ELSE "amountMinor" END)::bigint AS total
      FROM transactions
      GROUP BY "accountId"`,
    prisma.$queryRaw<
      { assetSymbol: string; price: string; quoteCurrency: string; fetchedAt: Date }[]
    >`
      SELECT DISTINCT ON ("assetSymbol") "assetSymbol", price::text AS price,
             "quoteCurrency", "fetchedAt"
      FROM price_quotes
      ORDER BY "assetSymbol", "fetchedAt" DESC`,
  ]);

  const sumMap = new Map(sums.map((s) => [s.accountId, Number(s.total ?? 0n)]));
  const quoteMap = new Map(quoteRows.map((q) => [q.assetSymbol, q]));

  const results: AccountBalance[] = [];
  for (const a of accounts) {
    const exponent = fx.currencies.get(a.currencyCode)?.exponent ?? 2;
    let balanceMinor: number;
    let stale = false;
    let priceStatus: AccountBalance["priceStatus"] = null;

    if (a.kind === "priced") {
      const quote = a.assetSymbol ? quoteMap.get(a.assetSymbol) : undefined;
      if (quote && a.quantity) {
        // price is in quote.quoteCurrency; value in account currency
        let valueMinor = holdingValueMinor(a.quantity.toString(), quote.price, exponent);
        if (quote.quoteCurrency !== a.currencyCode) {
          const from = fx.rateToDefault(quote.quoteCurrency);
          const to = fx.rateToDefault(a.currencyCode);
          if (from.rate.isZero() || to.rate.isZero()) {
            stale = true;
          } else {
            valueMinor = convertMinor(valueMinor, from.rate.div(to.rate), exponent, exponent);
          }
        }
        balanceMinor = valueMinor;
        const ageMs = Date.now() - quote.fetchedAt.getTime();
        const staleMs = a.subtype === "crypto" ? 3_600_000 : 86_400_000;
        stale = stale || ageMs > staleMs;
        priceStatus = stale ? "stale" : "ok";
      } else if (a.manualPriceMinor != null && a.quantity) {
        balanceMinor = new Decimal(a.quantity.toString())
          .mul(Number(a.manualPriceMinor))
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber();
        stale = a.priceSource !== "manual";
        priceStatus = a.priceSource === "manual" ? "ok" : "missing";
      } else {
        // live-priced account with no quote ever fetched — likely a bad symbol
        balanceMinor = 0;
        stale = true;
        priceStatus = "missing";
      }
    } else {
      balanceMinor = Number(a.openingBalanceMinor) + (sumMap.get(a.id) ?? 0);
    }

    let balanceDefaultMinor: number;
    if (a.currencyCode === fx.def) {
      balanceDefaultMinor = balanceMinor;
    } else {
      const rate = fx.rateToDefault(a.currencyCode);
      stale = stale || rate.stale;
      balanceDefaultMinor = rate.rate.isZero()
        ? 0
        : convertMinor(balanceMinor, rate.rate, exponent, fx.defExponent);
    }

    results.push({
      accountId: a.id,
      balanceMinor,
      currencyCode: a.currencyCode,
      balanceDefaultMinor,
      stale,
      priceStatus,
      isLiability: a.isLiability,
      includeInNetWorth: a.includeInNetWorth,
    });
  }
  return results;
}

export interface NetPosition {
  assetsDefaultMinor: number;
  liabilitiesDefaultMinor: number; // positive
  netDefaultMinor: number;
  anyStale: boolean;
}

/** Pure aggregation over already-computed balances. */
export function netPositionFromBalances(balances: AccountBalance[]): NetPosition {
  let assets = 0;
  let liabilities = 0;
  let anyStale = false;
  for (const b of balances) {
    if (!b.includeInNetWorth) continue;
    anyStale = anyStale || b.stale;
    if (b.isLiability) {
      liabilities += Math.max(0, -b.balanceDefaultMinor);
      // a liability account in positive balance counts as an asset
      assets += Math.max(0, b.balanceDefaultMinor);
    } else if (b.balanceDefaultMinor >= 0) {
      assets += b.balanceDefaultMinor;
    } else {
      liabilities += -b.balanceDefaultMinor;
    }
  }
  return {
    assetsDefaultMinor: assets,
    liabilitiesDefaultMinor: liabilities,
    netDefaultMinor: assets - liabilities,
    anyStale,
  };
}

export async function computeNetPosition(ctx?: FxContext): Promise<NetPosition> {
  return netPositionFromBalances(await computeBalances(ctx));
}
