import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, parseAmount } from "@/lib/money";
import { loadFxContext } from "@/modules/finance/server/fx";

const tradeSchema = z.object({
  holdingAccountId: z.string().min(1),
  fundingAccountId: z.string().min(1),
  action: z.enum(["buy", "sell"]),
  /** money side, major units in the FUNDING account's currency */
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  /** asset quantity bought/sold (positive) */
  quantity: z.string().regex(/^\d+(\.\d+)?$/),
});

/**
 * Buy/sell a priced holding: moves money on the funding account (as a
 * category-less transfer leg, so cash flow stays clean — investing is not
 * spending) and adjusts the holding's quantity, atomically.
 */
export async function POST(req: NextRequest) {
  const parsed = tradeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const [holding, funding, fx] = await Promise.all([
    prisma.account.findUnique({ where: { id: input.holdingAccountId } }),
    prisma.account.findUnique({ where: { id: input.fundingAccountId } }),
    loadFxContext(),
  ]);
  if (!holding || holding.kind !== "priced") {
    return NextResponse.json({ error: "Holding account not found" }, { status: 400 });
  }
  if (!funding || funding.kind !== "transactional") {
    return NextResponse.json({ error: "Funding account must be a normal account" }, { status: 400 });
  }

  const qty = new Decimal(input.quantity);
  if (qty.lte(0)) return NextResponse.json({ error: "Quantity must be positive" }, { status: 400 });
  const currentQty = new Decimal(holding.quantity?.toString() ?? "0");
  const newQty = input.action === "buy" ? currentQty.plus(qty) : currentQty.minus(qty);
  if (newQty.isNegative()) {
    return NextResponse.json(
      { error: `You only hold ${currentQty.toString()} — can't sell ${qty.toString()}` },
      { status: 400 },
    );
  }

  const exponent = fx.currencies.get(funding.currencyCode)?.exponent ?? 2;
  const amountMinor = parseAmount(input.amount, exponent);
  const rate = fx.rateToDefault(funding.currencyCode);
  if (rate.rate.isZero()) {
    return NextResponse.json({ error: `No FX rate for ${funding.currencyCode}` }, { status: 409 });
  }
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const verb = input.action === "buy" ? "Buy" : "Sell";

  const [txn] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        accountId: funding.id,
        type: input.action === "buy" ? "transfer_out" : "transfer_in",
        amountMinor: BigInt(amountMinor),
        currencyCode: funding.currencyCode,
        fxRateToDefault: rate.rate.toString(),
        amountDefaultMinor: BigInt(convertMinor(amountMinor, rate.rate, exponent, fx.defExponent)),
        date: today,
        note: `${verb} ${qty.toString()} ${holding.assetSymbol ?? holding.name}`,
      },
    }),
    prisma.account.update({
      where: { id: holding.id },
      data: { quantity: newQty.toString() },
    }),
  ]);

  return NextResponse.json(
    jsonSafe({ traded: true, transactionId: txn.id, newQuantity: newQty.toString() }),
    { status: 201 },
  );
}
