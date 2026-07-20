import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeBalances,
  netPositionFromBalances,
} from "@/modules/finance/server/balances";
import { loadFxContext } from "@/modules/finance/server/fx";
import { kuwaitToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // fail closed: an unset CRON_SECRET must reject everything, not allow everything
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // cron fires 20:55 UTC = 23:55 Kuwait
    const date = kuwaitToday();
    const ctx = await loadFxContext();
    const balances = await computeBalances(ctx);
    const net = netPositionFromBalances(balances);
    await prisma.netWorthSnapshot.upsert({
      where: { date },
      update: {
        assetsDefaultMinor: BigInt(net.assetsDefaultMinor),
        liabilitiesDefaultMinor: BigInt(net.liabilitiesDefaultMinor),
        netDefaultMinor: BigInt(net.netDefaultMinor),
        breakdownJson: JSON.stringify(balances),
      },
      create: {
        date,
        assetsDefaultMinor: BigInt(net.assetsDefaultMinor),
        liabilitiesDefaultMinor: BigInt(net.liabilitiesDefaultMinor),
        netDefaultMinor: BigInt(net.netDefaultMinor),
        breakdownJson: JSON.stringify(balances),
      },
    });
    return NextResponse.json({ ok: true, date, net: net.netDefaultMinor });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
