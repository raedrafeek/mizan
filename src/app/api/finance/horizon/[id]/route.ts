import { NextRequest, NextResponse } from "next/server";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, minorToDecimalString, parseAmount } from "@/lib/money";
import { scheduledItemUpdateSchema } from "@/lib/schemas/finance";
import { getRateToDefault } from "@/modules/finance/server/fx";
import { getDefaultCurrency } from "@/modules/finance/server/settings";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();

  // action: "log" — materialize a transaction for this item
  if (body.action === "log") {
    return logItem(id);
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
      categoryId: input.categoryId,
      alertDaysBefore: input.alertDaysBefore,
      status: input.status,
    },
  });
  return NextResponse.json(jsonSafe(item));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.scheduledItem.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}

function nextDueDate(dueDate: string, recurrence: "monthly" | "yearly"): string {
  const d = new Date(dueDate + "T00:00:00Z");
  if (recurrence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * "Log now": create the real transaction on the item's account, link it,
 * and either mark the item logged (one-off) or advance its due date (recurring).
 */
async function logItem(id: string) {
  const item = await prisma.scheduledItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: "Item is not pending" }, { status: 400 });
  }
  if (!item.accountId) {
    return NextResponse.json(
      { error: "Set an account on this item first (edit → account)" },
      { status: 400 },
    );
  }
  const account = await prisma.account.findUnique({
    where: { id: item.accountId },
    include: { currency: true },
  });
  if (!account || account.kind === "priced") {
    return NextResponse.json({ error: "Item's account is invalid" }, { status: 400 });
  }

  // item amount is in item.currencyCode; convert to the account currency if different
  let amountMinor = Number(item.amountMinor);
  const itemCurrency = await prisma.currency.findUnique({
    where: { code: item.currencyCode },
  });
  if (item.currencyCode !== account.currencyCode) {
    const from = await getRateToDefault(item.currencyCode);
    const to = await getRateToDefault(account.currencyCode);
    if (from.rate.isZero() || to.rate.isZero()) {
      return NextResponse.json({ error: "Missing FX rate for conversion" }, { status: 409 });
    }
    amountMinor = convertMinor(
      amountMinor,
      from.rate.div(to.rate),
      itemCurrency?.exponent ?? 2,
      account.currency.exponent,
    );
  }

  const def = await getDefaultCurrency();
  const defExp = (await prisma.currency.findUnique({ where: { code: def } }))?.exponent ?? 3;
  const fx = await getRateToDefault(account.currencyCode);
  if (fx.rate.isZero()) {
    return NextResponse.json({ error: `No FX rate for ${account.currencyCode}` }, { status: 409 });
  }
  const amountDefaultMinor = convertMinor(
    amountMinor,
    fx.rate,
    account.currency.exponent,
    defExp,
  );
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

  const [txn] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        accountId: account.id,
        type: item.direction === "outflow" ? "expense" : "income",
        amountMinor: BigInt(amountMinor),
        currencyCode: account.currencyCode,
        fxRateToDefault: new Decimal(fx.rate).toString(),
        amountDefaultMinor: BigInt(amountDefaultMinor),
        categoryId: item.categoryId,
        date: today,
        note: item.name,
      },
    }),
    item.recurrence
      ? prisma.scheduledItem.update({
          where: { id },
          data: { dueDate: nextDueDate(item.dueDate, item.recurrence) },
        })
      : prisma.scheduledItem.update({
          where: { id },
          data: { status: "logged", loggedTransactionId: null },
        }),
  ]);
  // link the created transaction (one-off items only; recurring items roll forward)
  if (!item.recurrence) {
    await prisma.scheduledItem.update({
      where: { id },
      data: { loggedTransactionId: txn.id },
    });
  }
  return NextResponse.json(
    jsonSafe({ logged: true, transactionId: txn.id, amountMinor: Number(txn.amountMinor), display: minorToDecimalString(amountMinor, account.currency.exponent) }),
  );
}
