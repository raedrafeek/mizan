import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { computeNetPosition } from "@/modules/finance/server/balances";
import { loadFxContext } from "@/modules/finance/server/fx";
import { refreshCryptoQuotes } from "@/modules/finance/server/prices";

export const dynamic = "force-dynamic";

export async function GET() {
  // lazy crypto refresh — never let a provider outage break the dashboard
  try {
    await refreshCryptoQuotes();
  } catch {
    // stale quotes flagged downstream
  }
  const ctx = await loadFxContext();
  const [current, snapshots] = await Promise.all([
    computeNetPosition(ctx),
    prisma.netWorthSnapshot.findMany({ orderBy: { date: "desc" }, take: 30 }),
  ]);
  return NextResponse.json(jsonSafe({ current, snapshots: snapshots.reverse() }));
}
