import { prisma } from "@/lib/prisma";

export interface CashFlow {
  month: string;
  incomeDefaultMinor: number;
  expenseDefaultMinor: number; // positive
  savingsDefaultMinor: number;
  savingsRatePct: number | null;
  /** per-day expense totals for the mini bar chart, index 0 = day 1 */
  dailyExpenseDefaultMinor: number[];
  incomeByCategory: { name: string; totalDefaultMinor: number }[];
}

/** Income/expense/savings for a month, in default currency. Transfers excluded;
 * refunds NET OUT of expense (money back is not income). */
export async function computeCashFlow(month: string): Promise<CashFlow> {
  const txns = await prisma.transaction.findMany({
    where: { date: { startsWith: month }, type: { in: ["expense", "income", "refund"] } },
    include: { category: { select: { name: true } } },
  });

  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const daily = Array(daysInMonth).fill(0);
  let income = 0;
  let expense = 0;
  const incomeByCat = new Map<string, number>();

  for (const t of txns) {
    const amt = Number(t.amountDefaultMinor);
    if (t.type === "income") {
      income += amt;
      const key = t.category?.name ?? "Other";
      incomeByCat.set(key, (incomeByCat.get(key) ?? 0) + amt);
    } else {
      const sign = t.type === "refund" ? -1 : 1;
      expense += sign * amt;
      const day = Number(t.date.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) daily[day - 1] += sign * amt;
    }
  }

  const savings = income - expense;
  return {
    month,
    incomeDefaultMinor: income,
    expenseDefaultMinor: expense,
    savingsDefaultMinor: savings,
    savingsRatePct: income > 0 ? Math.round((savings / income) * 1000) / 10 : null,
    dailyExpenseDefaultMinor: daily,
    incomeByCategory: [...incomeByCat.entries()]
      .map(([name, totalDefaultMinor]) => ({ name, totalDefaultMinor }))
      .sort((a, b) => b.totalDefaultMinor - a.totalDefaultMinor),
  };
}

export interface MonthlyReport {
  /** oldest → newest */
  months: {
    month: string;
    incomeDefaultMinor: number;
    expenseDefaultMinor: number; // net of refunds
    savingsDefaultMinor: number;
    savingsRatePct: number | null;
  }[];
  /** expense categories with any activity, biggest total first; monthly aligned to `months` */
  categories: { categoryId: string; name: string; icon: string; monthly: number[] }[];
  /** income by category over the whole period */
  incomeMix: { name: string; totalDefaultMinor: number }[];
}

/** Multi-month aggregates for the Trends view — ONE transaction query. */
export async function computeMonthlyReport(monthCount = 12): Promise<MonthlyReport> {
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const monthKeys: string[] = [];
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const monthIndex = new Map(monthKeys.map((k, i) => [k, i]));

  const txns = await prisma.transaction.findMany({
    where: {
      date: { gte: `${monthKeys[0]}-01` },
      type: { in: ["expense", "income", "refund"] },
    },
    select: {
      date: true,
      type: true,
      amountDefaultMinor: true,
      categoryId: true,
      category: { select: { name: true, icon: true } },
    },
  });

  const income = Array(monthCount).fill(0);
  const expense = Array(monthCount).fill(0);
  const catAgg = new Map<string, { name: string; icon: string; monthly: number[] }>();
  const incomeMix = new Map<string, number>();

  for (const t of txns) {
    const idx = monthIndex.get(t.date.slice(0, 7));
    if (idx === undefined) continue;
    const amt = Number(t.amountDefaultMinor);
    if (t.type === "income") {
      income[idx] += amt;
      const key = t.category?.name ?? "Other";
      incomeMix.set(key, (incomeMix.get(key) ?? 0) + amt);
    } else {
      const sign = t.type === "refund" ? -1 : 1;
      expense[idx] += sign * amt;
      const catKey = t.categoryId ?? "none";
      let cat = catAgg.get(catKey);
      if (!cat) {
        cat = {
          name: t.category?.name ?? "Uncategorized",
          icon: t.category?.icon ?? "other",
          monthly: Array(monthCount).fill(0),
        };
        catAgg.set(catKey, cat);
      }
      cat.monthly[idx] += sign * amt;
    }
  }

  return {
    months: monthKeys.map((month, i) => {
      const savings = income[i] - expense[i];
      return {
        month,
        incomeDefaultMinor: income[i],
        expenseDefaultMinor: expense[i],
        savingsDefaultMinor: savings,
        savingsRatePct: income[i] > 0 ? Math.round((savings / income[i]) * 1000) / 10 : null,
      };
    }),
    categories: [...catAgg.entries()]
      .map(([categoryId, c]) => ({ categoryId, ...c }))
      .sort(
        (a, b) =>
          b.monthly.reduce((s, v) => s + v, 0) - a.monthly.reduce((s, v) => s + v, 0),
      )
      .slice(0, 10),
    incomeMix: [...incomeMix.entries()]
      .map(([name, totalDefaultMinor]) => ({ name, totalDefaultMinor }))
      .sort((a, b) => b.totalDefaultMinor - a.totalDefaultMinor),
  };
}

export interface CategorySpend {
  categoryId: string;
  name: string;
  icon: string;
  spentDefaultMinor: number;
  budgetDefaultMinor: number | null;
  budgetId: string | null;
}

/** Expense totals per category for a month, joined with any monthly budget. */
export async function computeCategorySpend(month: string): Promise<CategorySpend[]> {
  const [categories, budgets, txns] = await Promise.all([
    prisma.category.findMany({ where: { archivedAt: null, type: "expense" } }),
    prisma.budget.findMany({
      where: {
        startMonth: { lte: month },
        OR: [{ endMonth: null }, { endMonth: { gte: month } }],
      },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId", "type"],
      where: { date: { startsWith: month }, type: { in: ["expense", "refund"] } },
      _sum: { amountDefaultMinor: true },
    }),
  ]);

  // refunds net out of the category's spend
  const spendMap = new Map<string, number>();
  for (const t of txns) {
    const key = t.categoryId ?? "none";
    const amt = Number(t._sum.amountDefaultMinor ?? 0n) * (t.type === "refund" ? -1 : 1);
    spendMap.set(key, (spendMap.get(key) ?? 0) + amt);
  }
  const budgetMap = new Map(budgets.map((b) => [b.categoryId, b]));

  const rows: CategorySpend[] = categories.map((c) => {
    const b = budgetMap.get(c.id);
    return {
      categoryId: c.id,
      name: c.name,
      icon: c.icon,
      spentDefaultMinor: spendMap.get(c.id) ?? 0,
      budgetDefaultMinor: b ? Number(b.amountDefaultMinor) : null,
      budgetId: b?.id ?? null,
    };
  });

  const uncategorized = spendMap.get("none");
  if (uncategorized) {
    rows.push({
      categoryId: "none",
      name: "Uncategorized",
      icon: "other",
      spentDefaultMinor: uncategorized,
      budgetDefaultMinor: null,
      budgetId: null,
    });
  }
  return rows.sort((a, b) => b.spentDefaultMinor - a.spentDefaultMinor);
}
