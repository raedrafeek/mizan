"use client";

import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { useCurrencies } from "../api/hooks";
import { useCashFlow } from "../api/hooks-m2";

export function CashFlowCard() {
  const { data } = useCashFlow();
  const { data: currencyData } = useCurrencies();
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;

  if (!data) return <Card title="CASH FLOW"><p className="text-xs text-faint">Loading…</p></Card>;
  const cf = data.cashflow;
  const monthName = new Date(cf.month + "-01T00:00:00").toLocaleString("en", { month: "long" }).toUpperCase();

  const totalBudget = data.categories.reduce((s, c) => s + (c.budgetDefaultMinor ?? 0), 0);
  const budgetedSpend = data.categories
    .filter((c) => c.budgetDefaultMinor !== null)
    .reduce((s, c) => s + c.spentDefaultMinor, 0);
  const budgetLeft = totalBudget - budgetedSpend;
  const usedPct = totalBudget > 0 ? Math.min(100, (budgetedSpend / totalBudget) * 100) : null;
  const dayOfMonth = Number(new Date().toISOString().slice(8, 10));
  const daysInMonth = cf.dailyExpenseDefaultMinor.length;
  const pacePct = (dayOfMonth / daysInMonth) * 100;
  const maxDay = Math.max(...cf.dailyExpenseDefaultMinor, 1);

  return (
    <Card title="CASH FLOW" right={<span className="num text-[10px] text-faint">{monthName}</span>}>
      <div className="flex flex-col gap-2 text-[12.5px]">
        <p className="flex justify-between">
          <span className="text-muted">Income</span>
          <span className="num text-pos">+{formatMinor(cf.incomeDefaultMinor, exponent)}</span>
        </p>
        {cf.incomeByCategory.length > 0 && (
          <p className="num -mt-1 text-right text-[10px] text-faint">
            {cf.incomeByCategory
              .slice(0, 3)
              .map((c) => `${c.name} ${formatMinor(c.totalDefaultMinor, exponent)}`)
              .join(" · ")}
          </p>
        )}
        <p className="flex justify-between">
          <span className="text-muted">Expense</span>
          <span className="num text-neg">−{formatMinor(cf.expenseDefaultMinor, exponent)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted">Savings</span>
          <span className="num text-ink">{formatMinor(cf.savingsDefaultMinor, exponent)}</span>
        </p>
        {cf.savingsRatePct !== null && (
          <p className="flex justify-between">
            <span className="text-muted">Savings rate</span>
            <span className={cn("num", cf.savingsRatePct >= 0 ? "text-pos" : "text-neg")}>
              {cf.savingsRatePct}%
            </span>
          </p>
        )}
        {totalBudget > 0 && (
          <p className="flex justify-between">
            <span className="text-muted">Budget left</span>
            <span className={cn("num", budgetLeft < 0 ? "text-neg" : "text-warn")}>
              {formatMinor(budgetLeft, exponent)}{" "}
              <span className="text-faint">/ {formatMinor(totalBudget, exponent)}</span>
            </span>
          </p>
        )}
      </div>

      {/* daily expense bars */}
      <div className="mt-4 flex h-[34px] items-end gap-[3px]">
        {cf.dailyExpenseDefaultMinor.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-[1.5px]"
            style={{
              height: v > 0 ? `${Math.max(8, (v / maxDay) * 100)}%` : "2px",
              background:
                v > 0 ? "rgba(240,84,76,0.75)" : "var(--color-inset-2)",
            }}
          />
        ))}
      </div>

      {usedPct !== null && (
        <div className="mt-3.5">
          <p className="num mb-1.5 flex justify-between text-[10px] text-faint">
            <span>BUDGET PACE</span>
            <span className={usedPct > pacePct ? "text-warn" : "text-pos"}>
              {usedPct.toFixed(0)}% USED · DAY {dayOfMonth}
            </span>
          </p>
          <div className="relative h-1 rounded-sm bg-inset-2">
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-sm",
                usedPct > pacePct ? "bg-warn" : "bg-pos",
              )}
              style={{ width: `${usedPct}%` }}
            />
            <span
              className="absolute -top-[3px] h-2.5 w-[1.5px] bg-ink"
              style={{ left: `${pacePct}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
