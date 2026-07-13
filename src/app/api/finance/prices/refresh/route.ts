import { NextResponse } from "next/server";
import { refreshCryptoQuotes, refreshStockQuotes } from "@/modules/finance/server/prices";

export const dynamic = "force-dynamic";

/** Manual "refresh prices now" button — forces crypto and stock quote fetches. */
export async function POST() {
  const results: Record<string, unknown> = {};
  try {
    results.crypto = await refreshCryptoQuotes(true);
  } catch (e) {
    results.crypto = { error: e instanceof Error ? e.message : String(e) };
  }
  try {
    results.stocks = await refreshStockQuotes();
  } catch (e) {
    results.stocks = { error: e instanceof Error ? e.message : String(e) };
  }
  return NextResponse.json(results);
}
