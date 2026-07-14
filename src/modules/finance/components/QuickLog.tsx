"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Decimal from "decimal.js";
import { cn } from "@/lib/cn";
import { parseAmount, convertMinor, formatMinor } from "@/lib/money";
import { todayISO } from "@/lib/format-money";
import { useToast } from "@/shell/toast";
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useCurrencies,
} from "../api/hooks";
import type { AccountDto } from "../types";
import { Icon } from "./Icon";

type Mode = "expense" | "income" | "transfer";

const LAST_CAT_KEY = "mizan.lastCat"; // + "." + mode
const USAGE_KEY = "mizan.catUsage";

function readUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function bumpUsage(categoryId: string) {
  const usage = readUsage();
  usage[categoryId] = (usage[categoryId] ?? 0) + 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

function dateLabel(date: string): string {
  const today = todayISO();
  if (date === today) return "Today";
  const y = new Date(new Date(today + "T00:00:00").getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (date === y) return "Yesterday";
  return date.slice(5); // "MM-DD"
}

/**
 * The hero interaction: sign toggle (− / + / ⇄) → amount → category chip
 * (or destination account for transfers) → COMMIT. Amount is in the selected
 * account's currency; converted preview shown passively.
 */
export function QuickLog({
  account,
  compact = false,
}: {
  account: AccountDto | null;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [counterId, setCounterId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const { data: accounts } = useAccounts();
  const create = useCreateTransaction();
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);

  // "/" anywhere focuses the amount input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      e.preventDefault();
      amountRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // close date popover on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // rail ordered by this device's usage (most-logged categories first)
  const rail = useMemo(() => {
    const usage = typeof window === "undefined" ? {} : readUsage();
    return (categories ?? [])
      .filter((c) => c.type === (mode === "income" ? "income" : "expense"))
      .sort(
        (a, b) =>
          (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.sortOrder - b.sortOrder,
      );
  }, [categories, mode]);

  // a category is ALWAYS selected (last used per mode, else first in rail) —
  // no "Uncategorized" logs from the quick-log
  useEffect(() => {
    if (mode === "transfer" || rail.length === 0) return;
    if (categoryId && rail.some((c) => c.id === categoryId)) return;
    const saved = localStorage.getItem(`${LAST_CAT_KEY}.${mode}`);
    const next = rail.find((c) => c.id === saved) ?? rail[0];
    setCategoryId(next.id);
  }, [rail, mode, categoryId]);
  const counterAccounts = useMemo(
    () =>
      (accounts ?? []).filter((a) => a.kind === "transactional" && a.id !== account?.id),
    [accounts, account],
  );

  const preview = useMemo(() => {
    if (!account || !currencyData || !amount) return null;
    if (account.currencyCode === currencyData.defaultCurrency) return null;
    const rate = currencyData.rates[account.currencyCode];
    if (!rate || new Decimal(rate.rate).lte(0)) return null;
    const defCur = currencyData.currencies.find(
      (c) => c.code === currencyData.defaultCurrency,
    );
    if (!defCur) return null;
    try {
      const minor = parseAmount(amount, account.currency.exponent);
      const converted = convertMinor(minor, rate.rate, account.currency.exponent, defCur.exponent);
      return `≈ ${formatMinor(converted, defCur.exponent)} ${defCur.code}`;
    } catch {
      return null;
    }
  }, [amount, account, currencyData]);

  const counter = counterAccounts.find((a) => a.id === counterId) ?? null;
  const ccWarning =
    mode === "expense" && account?.subtype === "credit_card"
      ? "Logging to Credit Card — adds to outstanding"
      : null;

  function commit() {
    setError(null);
    if (!account) return setError("Select an account to spend from");
    if (!amount) return setError("Enter an amount");
    if (mode === "transfer" && !counter) return setError("Pick a destination account");
    if (mode !== "transfer" && !categoryId) return setError("Pick a category");
    try {
      parseAmount(amount, account.currency.exponent); // validate locally first
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Invalid amount");
    }

    const payload = {
      accountId: account.id,
      type: (mode === "transfer" ? "transfer_out" : mode) as
        | "expense"
        | "income"
        | "transfer_out",
      amount,
      categoryId: mode === "transfer" ? undefined : categoryId!,
      counterAccountId: mode === "transfer" ? counter!.id : undefined,
      counterAmount:
        mode === "transfer" && counterAmount ? counterAmount : undefined,
      date,
    };

    // optimistic: clear instantly, reconcile in the background
    const failedAmount = amount;
    const failedDate = date;
    setAmount("");
    setCounterAmount("");
    // date deliberately stays — batch-logging several entries for the same
    // past day shouldn't require re-picking the date each time
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
    if (mode !== "transfer" && categoryId) {
      bumpUsage(categoryId);
      localStorage.setItem(`${LAST_CAT_KEY}.${mode}`, categoryId);
    }

    create.mutate(payload, {
      onError: (e) => {
        setAmount(failedAmount);
        setDate(failedDate);
        setFlash(false);
        toast.error(
          `Not logged: ${e instanceof Error ? e.message : "request failed"} — your entry was restored`,
        );
      },
    });
  }

  const yesterday = new Date(new Date(todayISO() + "T00:00:00").getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border bg-card p-3 transition-colors sm:gap-3.5",
          flash ? "border-pos/60" : "border-border-2",
        )}
      >
        {/* mode toggle */}
        <div className="flex flex-none gap-[3px] rounded-[11px] border border-border-3 bg-surface p-[3px]">
          {(
            [
              ["expense", "−"],
              ["income", "+"],
              ["transfer", "⇄"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setCategoryId(null);
                setCounterId(null);
              }}
              className={cn(
                "num h-8 w-8 rounded-lg text-base font-bold",
                mode === m
                  ? m === "expense"
                    ? "bg-neg/15 text-neg"
                    : m === "income"
                      ? "bg-pos/15 text-pos"
                      : "bg-inset-2 text-ink"
                  : "text-faint",
              )}
              aria-label={m}
            >
              {label}
            </button>
          ))}
        </div>

        {/* amount */}
        <input
          ref={amountRef}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          inputMode="decimal"
          placeholder={account ? (0).toFixed(account.currency.exponent) : "0.000"}
          className={cn(
            "num w-[96px] flex-none rounded-[11px] border bg-surface px-3 py-2.5 text-right text-base outline-none sm:w-[128px]",
            ccWarning ? "border-neg/55" : "border-border-3",
            mode === "income" ? "text-pos" : "text-ink",
          )}
        />

        {/* actual received amount for cross-currency transfers (fee/spread aware) */}
        {mode === "transfer" && counter && counter.currencyCode !== account?.currencyCode && (
          <input
            value={counterAmount}
            onChange={(e) => setCounterAmount(e.target.value)}
            inputMode="decimal"
            placeholder={`received ${counter.currencyCode}`}
            title="Actual amount credited (leave empty to use the mid-market rate)"
            className="num w-[110px] flex-none rounded-[11px] border border-border-3 bg-surface px-3 py-2.5 text-right text-[13px] text-ink outline-none"
          />
        )}

        {/* date chip */}
        <div ref={dateRef} className="relative flex-none">
          <button
            onClick={() => setDateOpen((v) => !v)}
            className={cn(
              "num rounded-[11px] border border-border-3 bg-surface px-2.5 py-2.5 text-[11px]",
              date === todayISO() ? "text-faint" : "text-warn",
            )}
          >
            {dateLabel(date)} ▾
          </button>
          {dateOpen && (
            <div className="absolute left-0 top-11 z-40 flex w-40 flex-col gap-1 rounded-xl border border-border-4 bg-card p-2 shadow-2xl">
              {(
                [
                  ["Today", todayISO()],
                  ["Yesterday", yesterday],
                ] as const
              ).map(([label, d]) => (
                <button
                  key={label}
                  onClick={() => {
                    setDate(d);
                    setDateOpen(false);
                  }}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-left text-xs",
                    date === d ? "bg-inset text-ink" : "text-muted hover:bg-card-hover",
                  )}
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    setDateOpen(false);
                  }
                }}
                className="num rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-[11px] text-ink outline-none"
              />
            </div>
          )}
        </div>

        {/* category rail / destination account rail */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="hs flex gap-2 overflow-x-auto p-0.5 pr-6">
            {mode === "transfer"
              ? counterAccounts.map((a) => {
                  const sel = counterId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setCounterId(sel ? null : a.id)}
                      className={cn(
                        "flex flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-semibold",
                        sel
                          ? "border-ink bg-ink text-surface"
                          : "border-border-4 text-muted hover:text-ink-2",
                      )}
                    >
                      <span className="text-[10px]">→</span>
                      <Icon name={a.icon} size={13} />
                      {!compact && a.name}
                    </button>
                  );
                })
              : rail.map((c) => {
                  const sel = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "flex flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-semibold",
                        sel
                          ? "border-ink bg-ink text-surface"
                          : "border-border-4 text-muted hover:text-ink-2",
                      )}
                    >
                      <Icon name={c.icon} size={13} />
                      {!compact && c.name}
                    </button>
                  );
                })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-card" />
        </div>

        {/* commit */}
        <button
          onClick={commit}
          className="flex-none rounded-[11px] bg-ink px-5 py-3 text-[12.5px] font-bold tracking-[1.5px] text-surface hover:bg-white sm:px-6"
        >
          COMMIT
        </button>
      </div>

      <div className="num mt-1.5 flex min-h-[15px] flex-wrap items-center gap-x-4 gap-y-1 px-4 text-[10.5px]">
        {account && (
          <span className="text-faint">
            {mode === "income" ? "Into" : "From"}: {account.name} ({account.currencyCode})
            {mode === "transfer" && counter && (
              <> → {counter.name} ({counter.currencyCode})</>
            )}
          </span>
        )}
        {preview && <span className="text-faint">{preview}</span>}
        {ccWarning && <span className="text-neg">{ccWarning}</span>}
        {mode === "transfer" && account?.subtype !== "credit_card" && counter?.subtype === "credit_card" && (
          <span className="text-pos">Card payment — reduces outstanding</span>
        )}
        {error && <span className="text-neg">{error}</span>}
        {flash && <span className="text-pos">Logged ✓</span>}
      </div>
    </div>
  );
}
