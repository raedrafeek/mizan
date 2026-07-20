import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Public liveness probe: proves the DB answers and shows how fresh the two
 * cron-fed datasets are. Deliberately contains no balances or amounts —
 * it sits outside the auth wall so uptime checks can hit it.
 */
export async function GET() {
  try {
    const [fx, snapshot] = await Promise.all([
      prisma.fxRate.findFirst({ orderBy: { asOfDate: "desc" }, select: { asOfDate: true } }),
      prisma.netWorthSnapshot.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    ]);
    return NextResponse.json({
      ok: true,
      db: true,
      lastFxDate: fx?.asOfDate ?? null,
      lastSnapshotDate: snapshot?.date ?? null,
    });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
