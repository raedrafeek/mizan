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
