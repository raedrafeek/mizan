"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/format-money";
import { formatMinor } from "@/lib/money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useToast } from "@/shell/toast";
import { useCurrencies } from "../api/hooks";
import { useSetBudget, type CashFlowResponse } from "../api/hooks-m2";

function lastFullMonths(n: number): string[] {
  const t = todayISO();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (i + 1), 1));
    return d.toISOString().slice(0, 7);
  });
}

interface Suggestion {
  categoryId: string;
  name: string;
  avgMinor: number;
  suggestedMajor: string;
  currentBudgetMinor: number | null;
}

/**
 * Budgets proposed from observed spending (last 3 full months' average,
 * rounded up) — budgets typed from optimism die; budgets grounded in
 * data stick.
 */
export function BudgetWizard({ onDone }: { onDone: () => void }) {
  const months = useMemo(() => lastFullMonths(3), []);
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const setBudget = useSetBudget();
  const toast = useToast();
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;

  const { data, isLoading } = useQuery({
    queryKey: ["budget-wizard", months],
    queryFn: async (): Promise<Suggestion[]> => {
      const results: CashFlowResponse[] = await Promise.all(
        months.map((m) =>
          fetch(`/api/finance/cashflow?month=${m}`).then((r) => {
            if (!r.ok) throw new Error(`Failed to load ${m}`);
            return r.json();
          }),
        ),
      );
      const totals = new Map<
        string,
        { name: string; sum: number; budget: number | null }
      >();
      for (const res of results) {
        for (const c of res.categories) {
          if (c.categoryId === "none") continue;
          const cur = totals.get(c.categoryId) ?? {
            name: c.name,
            sum: 0,
            budget: c.budgetDefaultMinor,
          };
          cur.sum += c.spentDefaultMinor;
          cur.budget = c.budgetDefaultMinor ?? cur.budget;
          totals.set(c.categoryId, cur);
        }
      }
      const step = 5 * 10 ** exponent; // round up to a clean 5
      return [...totals.entries()]
        .map(([categoryId, t]) => {
          const avg = t.sum / months.length;
          const rounded = Math.max(step, Math.ceil(avg / step) * step);
          return {
            categoryId,
            name: t.name,
            avgMinor: Math.round(avg),
            suggestedMajor: (rounded / 10 ** exponent).toFixed(exponent),
            currentBudgetMinor: t.budget,
          };
        })
        .filter((s) => s.avgMinor > 0)
        .sort((a, b) => b.avgMinor - a.avgMinor);
    },
    staleTime: 60_000,
  });

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);

  const isChecked = (s: Suggestion) =>
    checked[s.categoryId] ?? s.currentBudgetMinor === null; // new ones pre-checked
  const amountOf = (s: Suggestion) => amounts[s.categoryId] ?? s.suggestedMajor;
  const selected = (data ?? []).filter(isChecked);

  async function apply() {
    setApplying(true);
    try {
      for (const s of selected) {
        await setBudget.mutateAsync({ categoryId: s.categoryId, amount: amountOf(s) });
      }
      toast.success(
        `Set ${selected.length} budget${selected.length === 1 ? "" : "s"} from your last 3 months`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save budgets");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDone();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border-4 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl">
        <p className="text-[10.5px] font-bold tracking-[2px] text-faint">SUGGESTED BUDGETS</p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Your average spending over {months[2].slice(0, 7)} – {months[0].slice(0, 7)},
          rounded up. Untick what you don&apos;t want; amounts are editable.
        </p>

        {isLoading && <p className="py-6 text-center text-xs text-faint">Reading your history…</p>}

        <div className="mt-3 flex flex-col">
          {(data ?? []).map((s) => (
            <label
              key={s.categoryId}
              className="flex cursor-pointer items-center gap-3 border-b border-border py-2.5 last:border-0"
            >
              <input
                type="checkbox"
                checked={isChecked(s)}
                onChange={(e) =>
                  setChecked((c) => ({ ...c, [s.categoryId]: e.target.checked }))
                }
                className="accent-pos"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink-2">
                  {s.name}
                </span>
                <span className="num mt-0.5 block text-[10px] text-faint">
                  avg {masked(privacy, formatMinor(s.avgMinor, exponent))}/mo
                  {s.currentBudgetMinor !== null &&
                    ` · current budget ${masked(privacy, formatMinor(s.currentBudgetMinor, exponent))}`}
                </span>
              </span>
              <input
                value={amountOf(s)}
                onChange={(e) =>
                  setAmounts((a) => ({ ...a, [s.categoryId]: e.target.value }))
                }
                onClick={(e) => e.preventDefault()}
                inputMode="decimal"
                className={cn(
                  "num w-24 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs outline-none",
                  isChecked(s) ? "text-ink" : "text-faint",
                )}
              />
            </label>
          ))}
          {data && data.length === 0 && (
            <p className="py-6 text-center text-xs text-faint">
              Not enough spending history yet — log for a month and come back.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <button
            onClick={apply}
            disabled={applying || selected.length === 0}
            className="flex-1 rounded-xl bg-ink py-3 text-[11.5px] font-bold tracking-[1.5px] text-surface disabled:opacity-40"
          >
            {applying ? "SAVING…" : `SET ${selected.length} BUDGET${selected.length === 1 ? "" : "S"}`}
          </button>
          <button onClick={onDone} className="px-3 text-[11.5px] text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
