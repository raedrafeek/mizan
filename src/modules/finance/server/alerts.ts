import { prisma } from "@/lib/prisma";
import { formatMinor } from "@/lib/money";
import { computeCategorySpend } from "./reports";
import { getDefaultCurrency } from "./settings";

/**
 * Evaluate finance alert conditions and upsert deduped Alert rows.
 * dedupeKey makes re-runs idempotent (e.g. one budget alert per category per month).
 * Called lazily from GET /api/alerts — cheap queries only.
 */
export async function evaluateFinanceAlerts(): Promise<void> {
  const now = Date.now() + 3 * 3_600_000; // Kuwait time
  const today = new Date(now).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const def = await getDefaultCurrency();
  const exp = (await prisma.currency.findUnique({ where: { code: def } }))?.exponent ?? 3;

  // --- budget pace: spent above linear month pace + 15pt tolerance, or over budget ---
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const pacePct = (dayOfMonth / daysInMonth) * 100;

  const spend = await computeCategorySpend(month);
  for (const c of spend) {
    if (c.budgetDefaultMinor === null || c.budgetDefaultMinor <= 0) continue;
    const usedPct = (c.spentDefaultMinor / c.budgetDefaultMinor) * 100;
    const over = c.spentDefaultMinor > c.budgetDefaultMinor;
    if (!over && usedPct <= pacePct + 15) continue;
    await upsertAlert({
      kind: "budget_pace",
      severity: over ? "critical" : "warn",
      title: over
        ? `${c.name} over budget by ${formatMinor(c.spentDefaultMinor - c.budgetDefaultMinor, exp)} ${def}`
        : `${c.name} at ${usedPct.toFixed(0)}% of budget — pace is ${pacePct.toFixed(0)}%`,
      entityRef: `category:${c.categoryId}`,
      dedupeKey: `budget_pace:${c.categoryId}:${month}:${over ? "over" : "pace"}`,
    });
  }

  // --- horizon due soon ---
  const items = await prisma.scheduledItem.findMany({ where: { status: "pending" } });
  for (const i of items) {
    const daysUntil = Math.round(
      (new Date(i.dueDate + "T00:00:00Z").getTime() -
        new Date(today + "T00:00:00Z").getTime()) /
        86_400_000,
    );
    if (daysUntil > i.alertDaysBefore) continue;
    const cur = await prisma.currency.findUnique({ where: { code: i.currencyCode } });
    const amt = `${i.direction === "outflow" ? "−" : "+"}${formatMinor(Number(i.amountMinor), cur?.exponent ?? 2)} ${i.currencyCode}`;
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
  const priced = await prisma.account.findMany({
    where: { archivedAt: null, kind: "priced", includeInNetWorth: true, assetSymbol: { not: null } },
  });
  for (const a of priced) {
    const quote = await prisma.priceQuote.findFirst({
      where: { assetSymbol: a.assetSymbol! },
      orderBy: { fetchedAt: "desc" },
    });
    const ageDays = quote
      ? (Date.now() - quote.fetchedAt.getTime()) / 86_400_000
      : Infinity;
    if (ageDays <= 7) continue;
    await upsertAlert({
      kind: "stale_price",
      severity: "warn",
      title: quote
        ? `${a.name}: price is ${Math.floor(ageDays)}d old`
        : `${a.name}: no price data yet`,
      entityRef: `account:${a.id}`,
      dedupeKey: `stale_price:${a.id}:${today}`,
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
