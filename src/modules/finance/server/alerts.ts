import { prisma } from "@/lib/prisma";
import { formatMinor } from "@/lib/money";
import { kuwaitToday } from "@/lib/dates";
import { computeCategorySpend } from "./reports";
import { loadFxContext } from "./fx";

const EVAL_THROTTLE_MS = 10 * 60_000;
const LAST_EVAL_KEY = "alerts.lastEval";

/**
 * Evaluate finance alert conditions and upsert deduped Alert rows.
 * Throttled: runs at most every 10 minutes (tracked in settings) since it's
 * invoked lazily from GET /api/alerts. dedupeKey makes re-runs idempotent.
 */
export async function evaluateFinanceAlerts(force = false): Promise<void> {
  const last = await prisma.setting.findUnique({ where: { key: LAST_EVAL_KEY } });
  if (!force && last && Date.now() - Number(JSON.parse(last.valueJson)) < EVAL_THROTTLE_MS) {
    return;
  }
  await prisma.setting.upsert({
    where: { key: LAST_EVAL_KEY },
    update: { valueJson: JSON.stringify(Date.now()) },
    create: { key: LAST_EVAL_KEY, valueJson: JSON.stringify(Date.now()) },
  });

  const today = kuwaitToday();
  const month = today.slice(0, 7);

  const [fx, spend, items, priced, quoteRows] = await Promise.all([
    loadFxContext(),
    computeCategorySpend(month),
    prisma.scheduledItem.findMany({ where: { status: "pending" } }),
    prisma.account.findMany({
      where: {
        archivedAt: null,
        kind: "priced",
        includeInNetWorth: true,
        assetSymbol: { not: null },
      },
    }),
    prisma.$queryRaw<{ assetSymbol: string; fetchedAt: Date }[]>`
      SELECT DISTINCT ON ("assetSymbol") "assetSymbol", "fetchedAt"
      FROM price_quotes
      ORDER BY "assetSymbol", "fetchedAt" DESC`,
  ]);
  const quoteMap = new Map(quoteRows.map((q) => [q.assetSymbol, q]));

  // --- budget pace: spent above linear month pace + 15pt tolerance, or over budget ---
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const pacePct = (dayOfMonth / daysInMonth) * 100;

  for (const c of spend) {
    if (c.budgetDefaultMinor === null || c.budgetDefaultMinor <= 0) continue;
    const usedPct = (c.spentDefaultMinor / c.budgetDefaultMinor) * 100;
    const over = c.spentDefaultMinor > c.budgetDefaultMinor;
    if (!over && usedPct <= pacePct + 15) continue;
    await upsertAlert({
      kind: "budget_pace",
      severity: over ? "critical" : "warn",
      title: over
        ? `${c.name} over budget by ${formatMinor(c.spentDefaultMinor - c.budgetDefaultMinor, fx.defExponent)} ${fx.def}`
        : `${c.name} at ${usedPct.toFixed(0)}% of budget — pace is ${pacePct.toFixed(0)}%`,
      entityRef: `category:${c.categoryId}`,
      dedupeKey: `budget_pace:${c.categoryId}:${month}:${over ? "over" : "pace"}`,
    });
  }

  // --- horizon due soon ---
  for (const i of items) {
    const daysUntil = Math.round(
      (new Date(i.dueDate + "T00:00:00Z").getTime() -
        new Date(today + "T00:00:00Z").getTime()) /
        86_400_000,
    );
    if (daysUntil > i.alertDaysBefore) continue;
    const exponent = fx.currencies.get(i.currencyCode)?.exponent ?? 2;
    const amt = `${i.direction === "transfer" ? "⇄ " : i.direction === "outflow" ? "−" : "+"}${formatMinor(Number(i.amountMinor), exponent)} ${i.currencyCode}`;
    await upsertAlert({
      kind: "horizon_due",
      severity: daysUntil < 0 ? "critical" : "warn",
      title:
        daysUntil < 0
          ? `${i.name} was due ${-daysUntil}d ago (${amt})`
          : `${i.name} due in ${daysUntil}d (${amt})`,
      entityRef: `scheduled:${i.id}`,
      dedupeKey: `horizon_due:${i.id}:${i.dueDate}`,
    });
  }

  // --- stale prices on counted priced accounts ---
  for (const a of priced) {
    const quote = quoteMap.get(a.assetSymbol!);
    const ageDays = quote
      ? (Date.now() - quote.fetchedAt.getTime()) / 86_400_000
      : Infinity;
    if (ageDays <= 7) continue;
    // dedupe per account + condition (NOT per day — daily keys piled up duplicates);
    // once dismissed it stays quiet unless the condition changes (missing ↔ stale)
    await upsertAlert({
      kind: "stale_price",
      severity: "warn",
      title: quote
        ? `${a.name}: price is ${Math.floor(ageDays)}d old`
        : `${a.name}: no price found — check the asset symbol`,
      entityRef: `account:${a.id}`,
      dedupeKey: `stale_price:${a.id}:${quote ? "stale" : "missing"}`,
    });
  }
}

async function upsertAlert(a: {
  kind: string;
  severity: string;
  title: string;
  entityRef: string;
  dedupeKey: string;
}) {
  await prisma.alert.upsert({
    where: { dedupeKey: a.dedupeKey },
    update: {}, // never resurrect dismissed alerts or reset timestamps
    create: { module: "finance", ...a },
  });
}
