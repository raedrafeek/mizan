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
    const newest = await prisma.priceQuote.findFirst({
      where: { assetSymbol: { in: ids }, source: "coingecko" },
      orderBy: { fetchedAt: "desc" },
    });
    if (newest && Date.now() - newest.fetchedAt.getTime() < CRYPTO_FRESH_MS) {
      return { refreshed: 0 };
    }
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
