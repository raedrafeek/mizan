import { NextRequest, NextResponse } from "next/server";
import { jsonSafe } from "@/lib/serialize";
import { computeMonthlyReport } from "@/modules/finance/server/reports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const months = Math.min(
    24,
    Math.max(3, Number(req.nextUrl.searchParams.get("months") ?? 12) || 12),
  );
  const report = await computeMonthlyReport(months);
  return NextResponse.json(jsonSafe(report));
}
