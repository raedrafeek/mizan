import { prisma } from "@/lib/prisma";
import { convertMinor, minorToDecimalString } from "@/lib/money";
import { kuwaitToday } from "@/lib/dates";
import { loadFxContext } from "./fx";
import { buildTransferLegs } from "./transfers";

export type LogResult =
  | { ok: true; transactionId: string; display: string }
  | { ok: false; error: string; status: number };

/**
 * Next occurrence, clamped to the target month's last day — naive setUTCMonth
 * would overflow (Jan 31 + 1 month = Mar 3) and permanently drift a bill due
 * on the 31st to the 3rd. A day-31 bill lands on Feb 28, then back on Mar 31?
 * No: recurrence advances from the CURRENT due date, so the clamp holds it at
 * month-end from then on — the standard "31st ≈ last day" behavior.
 */
export function nextDueDate(dueDate: string, recurrence: "monthly" | "yearly"): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const targetY = recurrence === "monthly" ? y + Math.floor(m / 12) : y + 1;
  const targetM = recurrence === "monthly" ? (m % 12) + 1 : m;
  const daysInTarget = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
  const day = Math.min(d, daysInTarget);
  return `${targetY}-${String(targetM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * "Log now" for a scheduled item — creates the real transaction(s), then
 * marks the item logged (one-off) or advances its due date (recurring).
 * Transfer items create both legs, cash-flow-neutral, like a manual MOVED.
 * Shared by the API route and the auto-post cron.
 */
export async function logScheduledItem(id: string): Promise<LogResult> {
  const item = await prisma.scheduledItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "Not found", status: 404 };
  if (item.status !== "pending") {
    return { ok: false, error: "Item is not pending", status: 400 };
  }
  if (!item.accountId) {
    return {
      ok: false,
      error: "Set an account on this item first (edit → account)",
      status: 400,
    };
  }
  const [account, counter, fx] = await Promise.all([
    prisma.account.findUnique({ where: { id: item.accountId } }),
    item.counterAccountId
      ? prisma.account.findUnique({ where: { id: item.counterAccountId } })
      : Promise.resolve(null),
    loadFxContext(),
  ]);
  if (!account || account.kind === "priced") {
    return { ok: false, error: "Item's account is invalid", status: 400 };
  }
  const acctExponent = fx.currencies.get(account.currencyCode)?.exponent ?? 2;

  // item amount is in item.currencyCode; convert to the account currency if different
  let amountMinor = Number(item.amountMinor);
  if (item.currencyCode !== account.currencyCode) {
    const from = fx.rateToDefault(item.currencyCode);
    const to = fx.rateToDefault(account.currencyCode);
    if (from.rate.isZero() || to.rate.isZero()) {
      return { ok: false, error: "Missing FX rate for conversion", status: 409 };
    }
    amountMinor = convertMinor(
      amountMinor,
      from.rate.div(to.rate),
      fx.currencies.get(item.currencyCode)?.exponent ?? 2,
      acctExponent,
    );
  }

  const acctRate = fx.rateToDefault(account.currencyCode);
  if (acctRate.rate.isZero()) {
    return { ok: false, error: `No FX rate for ${account.currencyCode}`, status: 409 };
  }
  const amountDefaultMinor = convertMinor(
    amountMinor,
    acctRate.rate,
    acctExponent,
    fx.defExponent,
  );
  const today = kuwaitToday();

  const rollForward = item.recurrence
    ? prisma.scheduledItem.update({
        where: { id },
        data: { dueDate: nextDueDate(item.dueDate, item.recurrence) },
      })
    : prisma.scheduledItem.update({
        where: { id },
        data: { status: "logged" as const, loggedTransactionId: null },
      });

  let txnId: string;

  if (item.direction === "transfer") {
    if (!counter || counter.kind === "priced") {
      return {
        ok: false,
        error: "Set a destination account on this item first (edit)",
        status: 400,
      };
    }
    const legs = buildTransferLegs(fx, account, counter, amountMinor, {
      date: today,
      note: item.name,
    });
    if (!legs.ok) return { ok: false, error: legs.error, status: legs.status };
    const [outLeg] = await prisma.$transaction([
      prisma.transaction.create({ data: legs.outData }),
      prisma.transaction.create({ data: legs.inData }),
      rollForward,
    ]);
    txnId = outLeg.id;
  } else {
    const [txn] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          accountId: account.id,
          type: item.direction === "outflow" ? "expense" : "income",
          amountMinor: BigInt(amountMinor),
          currencyCode: account.currencyCode,
          fxRateToDefault: acctRate.rate.toString(),
          amountDefaultMinor: BigInt(amountDefaultMinor),
          categoryId: item.categoryId,
          date: today,
          note: item.name,
        },
      }),
      rollForward,
    ]);
    txnId = txn.id;
  }

  // link the created transaction (one-off items only; recurring roll forward)
  if (!item.recurrence) {
    await prisma.scheduledItem.update({
      where: { id },
      data: { loggedTransactionId: txnId },
    });
  }
  return { ok: true, transactionId: txnId, display: minorToDecimalString(amountMinor, acctExponent) };
}

/**
 * Post every pending auto-post item whose due date has arrived (Kuwait time).
 * Called from the daily cron. Recurring items that are several periods
 * overdue catch up fully in ONE run (each post rolls the due date forward,
 * so we loop per item until it's no longer due — bounded for safety).
 * Failures are recorded and skipped, never thrown.
 */
export async function postDueScheduledItems(): Promise<{ posted: number; failed: number }> {
  const today = kuwaitToday();
  const due = await prisma.scheduledItem.findMany({
    where: { status: "pending", autoPost: true, dueDate: { lte: today } },
    select: { id: true, name: true },
  });
  let posted = 0;
  let failed = 0;
  for (const item of due) {
    for (let i = 0; i < 36; i++) {
      const current = await prisma.scheduledItem.findUnique({ where: { id: item.id } });
      if (!current || current.status !== "pending" || current.dueDate > today) break;
      const res = await logScheduledItem(item.id);
      if (res.ok) {
        posted++;
      } else {
        failed++;
        console.error(`auto-post failed for ${item.id} (${item.name}): ${res.error}`);
        break; // don't retry a failing item in a loop
      }
    }
  }
  return { posted, failed };
}
