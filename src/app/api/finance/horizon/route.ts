import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { scheduledItemCreateSchema } from "@/lib/schemas/finance";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.scheduledItem.findMany({
    where: { status: "pending" },
    orderBy: { dueDate: "asc" },
  });
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const withMeta = items.map((i) => {
    const daysUntil = Math.round(
      (new Date(i.dueDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) /
        86_400_000,
    );
    return { ...i, daysUntil, warn: daysUntil <= i.alertDaysBefore };
  });
  return NextResponse.json(jsonSafe(withMeta));
}

export async function POST(req: NextRequest) {
  const parsed = scheduledItemCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const currency = await prisma.currency.findUnique({ where: { code: input.currencyCode } });
  if (!currency) return NextResponse.json({ error: "Unknown currency" }, { status: 400 });

  const item = await prisma.scheduledItem.create({
    data: {
      name: input.name,
      direction: input.direction,
      amountMinor: BigInt(parseAmount(input.amount, currency.exponent)),
      currencyCode: input.currencyCode,
      dueDate: input.dueDate,
      recurrence: input.recurrence,
      accountId: input.accountId,
      counterAccountId: input.counterAccountId,
      categoryId: input.categoryId,
      alertDaysBefore: input.alertDaysBefore,
      autoPost: input.autoPost,
    },
  });
  return NextResponse.json(jsonSafe(item), { status: 201 });
}
