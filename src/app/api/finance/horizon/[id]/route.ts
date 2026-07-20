import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { parseAmount } from "@/lib/money";
import { scheduledItemUpdateSchema } from "@/lib/schemas/finance";
import { logScheduledItem } from "@/modules/finance/server/horizon";
import { withErrors } from "@/lib/api-errors";

export const PATCH = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await req.json();

  // action: "log" — materialize the transaction(s) for this item
  if (body.action === "log") {
    const res = await logScheduledItem(id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(
      jsonSafe({ logged: true, transactionId: res.transactionId, display: res.display }),
    );
  }

  const parsed = scheduledItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const existing = await prisma.scheduledItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const code = input.currencyCode ?? existing.currencyCode;
  const currency = await prisma.currency.findUnique({ where: { code } });
  if (!currency) return NextResponse.json({ error: "Unknown currency" }, { status: 400 });

  const item = await prisma.scheduledItem.update({
    where: { id },
    data: {
      name: input.name,
      direction: input.direction,
      amountMinor:
        input.amount !== undefined
          ? BigInt(parseAmount(input.amount, currency.exponent))
          : undefined,
      currencyCode: input.currencyCode,
      dueDate: input.dueDate,
      recurrence: input.recurrence,
      accountId: input.accountId,
      counterAccountId: input.counterAccountId,
      categoryId: input.categoryId,
      alertDaysBefore: input.alertDaysBefore,
      autoPost: input.autoPost,
      status: input.status,
    },
  });
  return NextResponse.json(jsonSafe(item));
});

export const DELETE = withErrors(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await prisma.scheduledItem.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
});
