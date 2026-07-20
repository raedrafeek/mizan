import { NextRequest, NextResponse } from "next/server";
import { refreshFxRates } from "@/modules/finance/server/fx";
import { postDueScheduledItems } from "@/modules/finance/server/horizon";

export const dynamic = "force-dynamic";

/** Daily cron: refresh FX rates, then post any due auto-post scheduled items
 * (fresh rates first so posted transactions freeze today's rate). */
export async function GET(req: NextRequest) {
  // fail closed: an unset CRON_SECRET must reject everything, not allow everything
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshFxRates();
    const autoPost = await postDueScheduledItems();
    return NextResponse.json({ ok: true, ...result, autoPost });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
