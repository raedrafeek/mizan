import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { convertMinor } from "@/lib/money";
import type { FxContext } from "./fx";

interface TransferAccount {
  id: string;
  currencyCode: string;
}

export type TransferLegs =
  | {
      ok: true;
      groupId: string;
      outData: Prisma.TransactionUncheckedCreateInput;
      inData: Prisma.TransactionUncheckedCreateInput;
    }
  | { ok: false; error: string; status: number };

/**
 * The ONE place transfer legs are built (quick-log, split, scheduled items
 * all route here — three hand-rolled copies drifted before this existed).
 *
 * `amountMinor` is what leaves `from` (its currency). `counterAmountMinor`,
 * when given, is what actually arrived (counter currency) — the gap between
 * the legs' default values is the implicit bank fee/spread. Without it, the
 * mid-market cross rate estimates the credit. Each leg freezes its OWN rate
 * and default-currency value.
 */
export function buildTransferLegs(
  fx: FxContext,
  from: TransferAccount,
  to: TransferAccount,
  amountMinor: number,
  opts: {
    date: string;
    note?: string | null;
    counterAmountMinor?: number;
    /** manual FX override for the out leg (1 unit from-currency = rate default) */
    fromRateOverride?: Decimal;
  },
): TransferLegs {
  if (from.id === to.id) {
    return { ok: false, error: "Can't transfer an account to itself", status: 400 };
  }
  const fromRate = opts.fromRateOverride ?? fx.rateToDefault(from.currencyCode).rate;
  const toRate = fx.rateToDefault(to.currencyCode).rate;
  if (fromRate.isZero()) {
    return { ok: false, error: `No FX rate cached for ${from.currencyCode}`, status: 409 };
  }
  if (toRate.isZero()) {
    return { ok: false, error: `No FX rate cached for ${to.currencyCode}`, status: 409 };
  }
  const fromExp = fx.currencies.get(from.currencyCode)?.exponent ?? 2;
  const toExp = fx.currencies.get(to.currencyCode)?.exponent ?? 2;

  const counterMinor =
    opts.counterAmountMinor ??
    (to.currencyCode === from.currencyCode
      ? amountMinor
      : convertMinor(amountMinor, fromRate.div(toRate), fromExp, toExp));

  const groupId = randomUUID();
  const shared = { date: opts.date, note: opts.note ?? undefined, transferGroupId: groupId };
  return {
    ok: true,
    groupId,
    outData: {
      accountId: from.id,
      type: "transfer_out",
      amountMinor: BigInt(amountMinor),
      currencyCode: from.currencyCode,
      fxRateToDefault: fromRate.toString(),
      amountDefaultMinor: BigInt(convertMinor(amountMinor, fromRate, fromExp, fx.defExponent)),
      ...shared,
    },
    inData: {
      accountId: to.id,
      type: "transfer_in",
      amountMinor: BigInt(counterMinor),
      currencyCode: to.currencyCode,
      fxRateToDefault: toRate.toString(),
      amountDefaultMinor: BigInt(convertMinor(counterMinor, toRate, toExp, fx.defExponent)),
      ...shared,
    },
  };
}
