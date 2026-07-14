import { prisma } from "@/lib/prisma";

export const CRYPTO_FRESH_MS = 15 * 60_000; // lazy-refresh threshold
const FETCH_TIMEOUT = 10_000;

/**
 * Refresh crypto quotes from CoinGecko for all active priced crypto accounts,
 * but only if the newest cached quote is older than CRYPTO_FRESH_MS (or force).
 * Called lazily from the dashboard, never in a blocking read path.
 */
export async function refreshCryptoQuotes(force = false): Promise<{ refreshed: number }> {
  const accounts = await prisma.account.findMany({
    where: {
      archivedAt: null,
      kind: "priced",
      subtype: "crypto",
      priceSource: "coingecko",
      assetSymbol: { not: null },
    },
    select: { assetSymbol: true },
  });
  const ids = [...new Set(accounts.map((a) => a.assetSymbol!))];
  if (ids.length === 0) return { refreshed: 0 };

  if (!force) {
    // per-coin freshness: a newly added coin with no quote yet must not be
    // skipped just because another coin was refreshed recently
    const newestPerId = await prisma.priceQuote.groupBy({
      by: ["assetSymbol"],
      where: { assetSymbol: { in: ids }, source: "coingecko" },
      _max: { fetchedAt: true },
    });
    const cutoff = Date.now() - CRYPTO_FRESH_MS;
    const allFresh =
      newestPerId.length === ids.length &&
      newestPerId.every((q) => (q._max.fetchedAt?.getTime() ?? 0) > cutoff);
    if (allFresh) return { refreshed: 0 };
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data: Record<string, { usd?: number }> = await res.json();

  let refreshed = 0;
  for (const id of ids) {
    const price = data[id]?.usd;
    if (price === undefined) continue;
    await prisma.priceQuote.create({
      data: {
        assetSymbol: id,
        source: "coingecko",
        price: price.toString(),
        quoteCurrency: "USD",
      },
    });
    refreshed++;
  }
  return { refreshed };
}

/** Refresh stock quotes from Finnhub (hourly cron). Needs FINNHUB_API_KEY. */
export async function refreshStockQuotes(): Promise<{ refreshed: number; skipped?: string }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { refreshed: 0, skipped: "FINNHUB_API_KEY not set" };

  const accounts = await prisma.account.findMany({
    where: {
      archivedAt: null,
      kind: "priced",
      subtype: "stock",
      priceSource: "finnhub",
      assetSymbol: { not: null },
    },
    select: { assetSymbol: true },
  });
  const tickers = [...new Set(accounts.map((a) => a.assetSymbol!))];

  let refreshed = 0;
  for (const t of tickers) {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${key}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
    );
    if (!res.ok) continue;
    const data: { c?: number } = await res.json();
    if (!data.c) continue; // c = current price; 0 means unknown symbol
    await prisma.priceQuote.create({
      data: {
        assetSymbol: t,
        source: "finnhub",
        price: data.c.toString(),
        quoteCurrency: "USD",
      },
    });
    refreshed++;
  }
  return { refreshed };
}
