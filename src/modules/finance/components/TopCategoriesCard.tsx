"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/shell/Card";
import { CardSkeleton } from "@/shell/Skeleton";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { useCurrencies } from "../api/hooks";
import { useCashFlow, useSetBudget } from "../api/hooks-m2";

export function TopCategoriesCard({ month }: { month: string }) {
  const { data } = useCashFlow(month);
  const { data: currencyData } = useCurrencies();
  const setBudget = useSetBudget();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);

  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;

  if (!data)
    return (
      <Card title="BUDGETS">
        <CardSkeleton rows={5} />
      </Card>
    );

  // active = has spending or a budget; the rest stay one tap away so a budget
  // can be set on ANY category — including on a brand-new empty ledger
  const rows = data.categories.filter(
    (c) => c.spentDefaultMinor > 0 || c.budgetDefaultMinor !== null,
  );
  const unbudgeted = data.categories.filter(
    (c) => c.categoryId !== "none" && c.spentDefaultMinor === 0 && c.budgetDefaultMinor === null,
  );
  const visible = showAll ? [...rows, ...unbudgeted] : rows;

  async function save(categoryId: string) {
    try {
      await setBudget.mutateAsync({ categoryId, amount: draft || "0" });
      setEditing(null);
    } catch {
      /* keep editing on failure */
    }
  }

  return (
    <Card
      title="BUDGETS"
      right={
        <span className="num text-[10.5px] text-muted">
          {new Date(month + "-01T00:00:00").toLocaleString("en", { month: "long" }).toUpperCase()}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <p className="text-xs text-faint">
            No budgets yet — set one on any category below.
          </p>
        )}
        {visible.map((c) => {
          const over =
            c.budgetDefaultMinor !== null && c.spentDefaultMinor > c.budgetDefaultMinor;
          const near =
            c.budgetDefaultMinor !== null &&
            !over &&
            c.spentDefaultMinor > c.budgetDefaultMinor * 0.8;
          const w =
            c.budgetDefaultMinor && c.budgetDefaultMinor > 0
              ? Math.min(100, (c.spentDefaultMinor / c.budgetDefaultMinor) * 100)
              : c.spentDefaultMinor > 0
                ? 100
                : 0;
          return (
            <div key={c.categoryId}>
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="min-w-0 font-medium text-muted">
                  {c.categoryId !== "none" ? (
                    <Link
                      href={`/activity?categoryId=${c.categoryId}&month=${month}`}
                      className="hover:text-ink hover:underline"
                    >
                      {c.name}
                    </Link>
                  ) : (
                    c.name
                  )}{" "}
                  {over && (
                    <span className="num whitespace-nowrap text-[9px] font-bold tracking-[1px] text-neg">
                      OVER +{formatMinor(c.spentDefaultMinor - c.budgetDefaultMinor!, exponent)}
                    </span>
                  )}
                </span>
                <span className="num ml-2 flex-none whitespace-nowrap">
                  <span className={cn(over ? "text-neg" : near ? "text-warn" : "text-ink")}>
                    {formatMinor(c.spentDefaultMinor, exponent)}
                  </span>{" "}
                  <span className="text-ghost">/</span>{" "}
                  {editing === c.categoryId ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save(c.categoryId);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => save(c.categoryId)}
                      inputMode="decimal"
                      className="num w-16 rounded border border-border-3 bg-surface px-1 text-right text-[11px] outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        if (c.categoryId === "none") return;
                        setEditing(c.categoryId);
                        setDraft(
                          c.budgetDefaultMinor !== null
                            ? (c.budgetDefaultMinor / 10 ** exponent).toString()
                            : "",
                        );
                      }}
                      className="text-faint underline-offset-2 hover:underline"
                    >
                      {c.budgetDefaultMinor !== null
                        ? formatMinor(c.budgetDefaultMinor, exponent)
                        : "set"}
                    </button>
                  )}
                </span>
              </div>
              <div className="h-1 rounded-sm bg-inset-2">
                <span
                  className={cn(
                    "block h-1 rounded-sm",
                    over ? "bg-neg" : near ? "bg-warn" : "bg-ghost",
                  )}
                  style={{ width: `${w}%` }}
                />
              </div>
            </div>
          );
        })}
        {unbudgeted.length > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="self-start text-[11.5px] font-semibold text-muted hover:text-ink"
          >
            {showAll
              ? "Hide categories without a budget"
              : `＋ Set a budget (${unbudgeted.length} more categor${unbudgeted.length === 1 ? "y" : "ies"})`}
          </button>
        )}
      </div>
    </Card>
  );
}
