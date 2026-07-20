import { NextRequest, NextResponse } from "next/server";
import { refreshStockQuotes } from "@/modules/finance/server/prices";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // fail closed: an unset CRON_SECRET must reject everything, not allow everything
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshStockQuotes();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
