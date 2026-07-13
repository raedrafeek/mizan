import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { convertMinor, holdingValueMinor } from "@/lib/money";
import { getRateToDefault } from "./fx";
import { getDefaultCurrency } from "./settings";

export interface AccountBalance {
  accountId: string;
  /** balance in the account's own currency, minor units (negative for liabilities in debt) */
  balanceMinor: number;
  currencyCode: string;
  /** balance converted to default currency, minor units */
  balanceDefaultMinor: number;
  stale: boolean;
}

/** Compute balances for all non-archived accounts (own currency + default-converted). */
export async function computeBalances(): Promise<AccountBalance[]> {
  const def = await getDefaultCurrency();
  const accounts = await prisma.account.findMany({
    where: { archivedAt: null },
    include: { currency: true },
  });
  const defCurrency = await prisma.currency.findUnique({ where: { code: def } });
  if (!defCurrency) throw new Error(`Default currency ${def} missing from currencies table`);

  // Signed sums per account in one query
  const sums = await prisma.$queryRaw<
    { accountId: string; total: bigint | null }[]
  >`
    SELECT "accountId",
           SUM(CASE WHEN type IN ('expense','transfer_out') THEN -"amountMinor"
                    ELSE "amountMinor" END)::bigint AS total
    FROM transactions
    GROUP BY "accountId"
  `;
  const sumMap = new Map(sums.map((s) => [s.accountId, Number(s.total ?? 0n)]));

  const results: AccountBalance[] = [];
  for (const a of accounts) {
    let balanceMinor: number;
    let stale = false;

    if (a.kind === "priced") {
      const quote = a.assetSymbol
        ? await prisma.priceQuote.findFirst({
            where: { assetSymbol: a.assetSymbol },
            orderBy: { fetchedAt: "desc" },
          })
        : null;
      if (quote && a.quantity) {
        // price is in quote.quoteCurrency; convert to account currency if needed
        let priceMinorInAcct = holdingValueMinor(
          a.quantity.toString(),
          quote.price.toString(),
          a.currency.exponent,
        );
        if (quote.quoteCurrency !== a.currencyCode) {
          const from = await getRateToDefault(quote.quoteCurrency);
          const to = await getRateToDefault(a.currencyCode);
          if (to.rate.isZero() || from.rate.isZero()) {
            stale = true;
          } else {
            priceMinorInAcct = convertMinor(
              priceMinorInAcct,
              from.rate.div(to.rate),
              a.currency.exponent,
              a.currency.exponent,
            );
          }
        }
        balanceMinor = priceMinorInAcct;
        const ageMs = Date.now() - quote.fetchedAt.getTime();
        const staleMs = a.subtype === "crypto" ? 3_600_000 : 86_400_000;
        stale = stale || ageMs > staleMs;
      } else if (a.manualPriceMinor != null && a.quantity) {
        balanceMinor = new Decimal(a.quantity.toString())
          .mul(Number(a.manualPriceMinor))
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber();
        stale = a.priceSource !== "manual";
      } else {
        balanceMinor = 0;
        stale = true;
      }
    } else {
      balanceMinor = Number(a.openingBalanceMinor) + (sumMap.get(a.id) ?? 0);
    }

    let balanceDefaultMinor: number;
    if (a.currencyCode === def) {
      balanceDefaultMinor = balanceMinor;
    } else {
      const fx = await getRateToDefault(a.currencyCode);
      stale = stale || fx.stale;
      balanceDefaultMinor = fx.rate.isZero()
        ? 0
        : convertMinor(balanceMinor, fx.rate, a.currency.exponent, defCurrency.exponent);
    }

    results.push({
      accountId: a.id,
      balanceMinor,
      currencyCode: a.currencyCode,
      balanceDefaultMinor,
      stale,
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

export async function computeNetPosition(): Promise<NetPosition> {
  const accounts = await prisma.account.findMany({
    where: { archivedAt: null, includeInNetWorth: true },
    select: { id: true, isLiability: true },
  });
  const included = new Map(accounts.map((a) => [a.id, a]));
  const balances = await computeBalances();

  let assets = 0;
  let liabilities = 0;
  let anyStale = false;
  for (const b of balances) {
    const acct = included.get(b.accountId);
    if (!acct) continue;
    anyStale = anyStale || b.stale;
    if (acct.isLiability) {
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
