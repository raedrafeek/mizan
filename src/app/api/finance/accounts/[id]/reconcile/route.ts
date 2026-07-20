import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";
import { convertMinor, minorToDecimalString, parseAmount } from "@/lib/money";
import { loadFxContext } from "@/modules/finance/server/fx";
import { withErrors } from "@/lib/api-errors";
import { kuwaitToday } from "@/lib/dates";

const schema = z.object({
  actualBalance: z.string().regex(/^-?\d+(\.\d+)?$/), // major units; negative allowed (credit cards)
});

/**
 * Reconcile: set the account's real-world balance. Creates a single signed
 * `adjustment` transaction for the delta (the one type whose amountMinor
 * carries its own sign) so history stays intact and auditable.
 */
export const POST = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [account, fx, signed] = await Promise.all([
    prisma.account.findUnique({ where: { id } }),
    loadFxContext(),
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(CASE WHEN type IN ('expense','transfer_out') THEN -"amountMinor"
                      ELSE "amountMinor" END)::bigint AS total
      FROM transactions WHERE "accountId" = ${id}`,
  ]);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (account.kind === "priced") {
    return NextResponse.json(
      { error: "Priced accounts reconcile by editing quantity" },
      { status: 400 },
    );
  }
  const exponent = fx.currencies.get(account.currencyCode)?.exponent ?? 2;
  const current = Number(account.openingBalanceMinor) + Number(signed[0]?.total ?? 0n);

  const neg = parsed.data.actualBalance.startsWith("-");
  const actualAbs = parseAmount(parsed.data.actualBalance.replace(/^-/, ""), exponent);
  const actual = neg ? -actualAbs : actualAbs;
  const deltaMinor = actual - current;
  if (deltaMinor === 0) {
    return NextResponse.json({ reconciled: true, delta: 0 });
  }

  const rate = fx.rateToDefault(account.currencyCode);
  const deltaDefaultMinor = rate.rate.isZero()
    ? 0
    : convertMinor(deltaMinor, rate.rate, exponent, fx.defExponent);
  const today = kuwaitToday();

  const txn = await prisma.transaction.create({
    data: {
      accountId: id,
      type: "adjustment",
      amountMinor: BigInt(deltaMinor), // signed — see note above
      currencyCode: account.currencyCode,
      fxRateToDefault: rate.rate.toString(),
      amountDefaultMinor: BigInt(deltaDefaultMinor),
      date: today,
      note: `Reconciled to ${minorToDecimalString(actual, exponent)} ${account.currencyCode}`,
    },
  });
  return NextResponse.json(
    jsonSafe({ reconciled: true, delta: deltaMinor, transactionId: txn.id }),
  );
});
