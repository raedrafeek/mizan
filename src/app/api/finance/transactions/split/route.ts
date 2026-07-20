import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, parseAmount } from "@/lib/money";
import { loadFxContext } from "@/modules/finance/server/fx";
import { buildTransferLegs } from "@/modules/finance/server/transfers";
import { withErrors } from "@/lib/api-errors";
import { kuwaitToday } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

const splitSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  parts: z
    .array(
      z.object({
        type: z.enum(["expense", "transfer_out"]),
        amount: z.string().regex(/^\d+(\.\d+)?$/),
        categoryId: z.string().optional(),
        counterAccountId: z.string().optional(),
      }),
    )
    .min(1)
    .max(12),
});

/** One payment fanned into parts — created ATOMICALLY (all or nothing). */
export const POST = withErrors(async (req: NextRequest) => {
  const parsed = splitSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.date > kuwaitToday()) {
    return NextResponse.json({ error: `Date ${input.date} is in the future` }, { status: 400 });
  }

  const [account, fx] = await Promise.all([
    prisma.account.findUnique({ where: { id: input.accountId } }),
    loadFxContext(),
  ]);
  if (!account || account.kind !== "transactional") {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  const exponent = fx.currencies.get(account.currencyCode)?.exponent ?? 2;
  const rate = fx.rateToDefault(account.currencyCode);
  if (rate.rate.isZero()) {
    return NextResponse.json({ error: `No FX rate for ${account.currencyCode}` }, { status: 409 });
  }

  const creates: Prisma.PrismaPromise<{ id: string; type: string }>[] = [];
  for (const part of input.parts) {
    const amountMinor = parseAmount(part.amount, exponent);
    if (amountMinor <= 0) {
      return NextResponse.json({ error: "Each part must be positive" }, { status: 400 });
    }
    const amountDefaultMinor = convertMinor(amountMinor, rate.rate, exponent, fx.defExponent);

    if (part.type === "expense") {
      creates.push(
        prisma.transaction.create({
          data: {
            accountId: account.id,
            type: "expense",
            amountMinor: BigInt(amountMinor),
            currencyCode: account.currencyCode,
            fxRateToDefault: rate.rate.toString(),
            amountDefaultMinor: BigInt(amountDefaultMinor),
            categoryId: part.categoryId,
            date: input.date,
            note: input.note,
          },
          select: { id: true, type: true },
        }),
      );
    } else {
      if (!part.counterAccountId) {
        return NextResponse.json({ error: "Transfer part needs a destination" }, { status: 400 });
      }
      const counter = await prisma.account.findUnique({ where: { id: part.counterAccountId } });
      if (!counter || counter.kind !== "transactional") {
        return NextResponse.json({ error: "Invalid destination account" }, { status: 400 });
      }
      const legs = buildTransferLegs(fx, account, counter, amountMinor, {
        date: input.date,
        note: input.note,
      });
      if (!legs.ok) return NextResponse.json({ error: legs.error }, { status: legs.status });
      creates.push(
        prisma.transaction.create({ data: legs.outData, select: { id: true, type: true } }),
        prisma.transaction.create({ data: legs.inData, select: { id: true, type: true } }),
      );
    }
  }

  const rows = await prisma.$transaction(creates);
  // undo needs one id per logical part (deleting a transfer_out removes its pair)
  const ids = rows.filter((r) => r.type !== "transfer_in").map((r) => r.id);
  return NextResponse.json(jsonSafe({ created: ids.length, ids }), { status: 201 });
});
