import { NextRequest, NextResponse } from "next/server";
import { computeCashFlow, computeCategorySpend } from "@/modules/finance/server/reports";
import { kuwaitMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? kuwaitMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const [cashflow, categories] = await Promise.all([
    computeCashFlow(month),
    computeCategorySpend(month),
  ]);
  return NextResponse.json({ cashflow, categories });
}
