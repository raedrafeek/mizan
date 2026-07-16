import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { computeNetPosition } from "@/modules/finance/server/balances";
import { loadFxContext } from "@/modules/finance/server/fx";
import { refreshCryptoQuotes } from "@/modules/finance/server/prices";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ?days=N controls how much snapshot history returns (default 30, cap 4000)
  const days = Math.min(
    4000,
    Math.max(7, Number(req.nextUrl.searchParams.get("days") ?? 30) || 30),
  );
  // lazy crypto refresh — never let a provider outage break the dashboard
  try {
    await refreshCryptoQuotes();
  } catch {
    // stale quotes flagged downstream
  }
  const ctx = await loadFxContext();
  const [current, snapshots] = await Promise.all([
    computeNetPosition(ctx),
    prisma.netWorthSnapshot.findMany({ orderBy: { date: "desc" }, take: days }),
  ]);
  return NextResponse.json(jsonSafe({ current, snapshots: snapshots.reverse() }));
}
