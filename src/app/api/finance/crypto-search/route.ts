import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * CoinGecko symbol search — so users pick the correct API id ("hedera-hashgraph")
 * instead of typing a ticker ("HBAR") that silently never prices.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ coins: [] });
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const coins = (data.coins ?? [])
      .slice(0, 8)
      .map((c: { id: string; name: string; symbol: string; market_cap_rank: number | null }) => ({
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        rank: c.market_cap_rank,
      }));
    return NextResponse.json({ coins });
  } catch (e) {
    return NextResponse.json(
      { coins: [], error: e instanceof Error ? e.message : "search failed" },
      { status: 502 },
    );
  }
}
