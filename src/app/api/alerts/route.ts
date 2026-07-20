import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { evaluateFinanceAlerts } from "@/modules/finance/server/alerts";

export const dynamic = "force-dynamic";

/** Module-agnostic alert feed. Evaluators run lazily here (throttled client-side). */
export async function GET() {
  try {
    await evaluateFinanceAlerts();
  } catch (e) {
    // evaluation failure must never break the tray; show what we have
    console.warn("alert evaluation failed:", e instanceof Error ? e.message : e);
  }
  const alerts = await prisma.alert.findMany({
    where: { dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(jsonSafe(alerts));
}
