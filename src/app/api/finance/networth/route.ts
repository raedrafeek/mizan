import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { computeNetPosition } from "@/modules/finance/server/balances";
import { refreshCryptoQuotes } from "@/modules/finance/server/prices";

export const dynamic = "force-dynamic";

export async function GET() {
  // lazy crypto refresh — never let a provider outage break the dashboard
  try {
    await refreshCryptoQuotes();
  } catch {
    // stale quotes flagged downstream
  }
  const [current, snapshots] = await Promise.all([
    computeNetPosition(),
    prisma.netWorthSnapshot.findMany({ orderBy: { date: "desc" }, take: 30 }),
  ]);
  return NextResponse.json(jsonSafe({ current, snapshots: snapshots.reverse() }));
}
