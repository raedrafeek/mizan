"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { todayISO } from "@/lib/format-money";
import { masked, usePrivacy } from "@/shell/privacy";
import { Skeleton } from "@/shell/Skeleton";
import { useCurrencies } from "../api/hooks";
import { useCashFlow } from "../api/hooks-m2";

/**
 * The Home verdict: what's left of this month's budgets, per remaining day.
 * Tapping the number opens the breakdown — a computed verdict the user can't
 * interrogate is a verdict they'll stop trusting.
 * Falls back to "spent this month" when no budgets exist.
 */
export function SafeToSpendHero() {
  const month = todayISO().slice(0, 7);
  const { data } = useCashFlow(month);
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const [open, setOpen] = useState(false);

  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const def = currencyData?.defaultCurrency ?? "KWD";

  if (!data) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-3.5 w-52" />
      </div>
    );
  }

  const today = todayISO();
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
    0,
  ).getDate();
  const daysLeft = daysInMonth - dayOfMonth + 1; // today still counts

  const budgeted = data.categories.filter((c) => c.budgetDefaultMinor !== null);
  const totalBudget = budgeted.reduce((s, c) => s + (c.budgetDefaultMinor ?? 0), 0);
  const budgetedSpend = budgeted.reduce((s, c) => s + c.spentDefaultMinor, 0);
  const otherSpend = data.cashflow.expenseDefaultMinor - budgetedSpend;
  const left = totalBudget - budgetedSpend;
  const over = left < 0;
  const perDay = daysLeft > 0 ? Math.max(0, Math.floor(left / daysLeft)) : 0;
  const usedPct = totalBudget > 0 ? Math.min(100, (budgetedSpend / totalBudget) * 100) : 0;
  const pacePct = (dayOfMonth / daysInMonth) * 100;

  // summary surfaces round to whole units — exact figures live in the breakdown
  const whole = (minor: number) =>
    Math.round(Math.abs(minor) / 10 ** exponent).toLocaleString("en");
  const oneDecimal = (minor: number) =>
    (Math.abs(minor) / 10 ** exponent).toFixed(1);

  // no budgets yet — an honest fallback instead of a fake zero
  if (totalBudget === 0) {
    const avg = dayOfMonth > 0 ? Math.round(data.cashflow.expenseDefaultMinor / dayOfMonth) : 0;
    return (
      <div className="py-2">
        <p className="text-[11px] font-semibold tracking-[2.5px] text-muted">
          SPENT THIS MONTH
        </p>
        <p className="num mt-2 text-[42px] font-semibold leading-none tracking-tight sm:text-5xl">
          {masked(privacy, whole(data.cashflow.expenseDefaultMinor))}{" "}
          <span className="text-lg font-medium text-faint sm:text-xl">{def}</span>
        </p>
        <p className="num mt-3 text-[13.5px] text-muted">
          ≈ {masked(privacy, oneDecimal(avg))} a day ·{" "}
          <Link href="/plan" className="text-ink underline underline-offset-2">
            set budgets
          </Link>{" "}
          to see what&apos;s safe to spend
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <button onClick={() => setOpen(true)} className="block text-left">
        <p className="text-[11px] font-semibold tracking-[2.5px] text-muted">
          SAFE TO SPEND · {new Date(month + "-01T00:00:00").toLocaleString("en", { month: "long" }).toUpperCase()}
        </p>
        <p
          className={cn(
            "num mt-2 text-[42px] font-semibold leading-none tracking-tight sm:text-5xl",
            over && "text-neg",
          )}
        >
          {over && !privacy ? "−" : ""}
          {masked(privacy, whole(left))}{" "}
          <span className="text-lg font-medium text-faint sm:text-xl">{def}</span>
        </p>
        <p className="num mt-3 text-[13.5px] text-muted">
          {over ? (
            <>over budget with <b className="text-ink">{daysLeft}</b> days to go — tap to see where</>
          ) : (
            <>
              <b className="text-ink">{masked(privacy, oneDecimal(perDay))}</b> a day for{" "}
              <b className="text-ink">{daysLeft}</b> more days
            </>
          )}
        </p>
      </button>
      <div className="relative mt-4 h-1.5 max-w-xl rounded-sm bg-inset-2">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-sm",
            over || usedPct > pacePct ? "bg-warn" : "bg-pos",
            over && "bg-neg",
          )}
          style={{ width: `${usedPct}%` }}
        />
        <span
          className="absolute -top-[3px] h-3 w-[1.5px] rounded-full bg-ink opacity-80"
          style={{ left: `${pacePct}%` }}
        />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl border border-border-4 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl">
            <p className="mb-3 text-[10.5px] font-bold tracking-[2px] text-faint">
              HOW THIS IS CALCULATED
            </p>
            <div className="num flex flex-col gap-2 text-[13px]">
              <p className="flex justify-between">
                <span className="text-muted">Monthly budgets</span>
                <span>{masked(privacy, formatMinor(totalBudget, exponent))}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted">Spent in budgeted categories</span>
                <span className="text-neg">
                  −{masked(privacy, formatMinor(budgetedSpend, exponent))}
                </span>
              </p>
              <p className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>{over ? "Over by" : "Safe to spend"}</span>
                <span className={over ? "text-neg" : "text-pos"}>
                  {masked(privacy, formatMinor(Math.abs(left), exponent))} {def}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted">Days left (incl. today)</span>
                <span>{daysLeft}</span>
              </p>
              {!over && (
                <p className="flex justify-between">
                  <span className="text-muted">Per day</span>
                  <span>{masked(privacy, formatMinor(perDay, exponent))}</span>
                </p>
              )}
              {otherSpend > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  {masked(privacy, formatMinor(otherSpend, exponent))} {def} spent in
                  categories without a budget isn&apos;t counted here.
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/plan"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-ink px-4 py-2 text-[11px] font-bold tracking-wide text-surface"
              >
                ADJUST BUDGETS
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="px-2 text-[11.5px] text-muted hover:text-ink"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
