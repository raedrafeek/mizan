"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { cn } from "@/lib/cn";
import { parseAmount, convertMinor, formatMinor } from "@/lib/money";
import { todayISO } from "@/lib/format-money";
import { useCategories, useCreateTransaction, useCurrencies } from "../api/hooks";
import type { AccountDto } from "../types";
import { Icon } from "./Icon";

type Mode = "expense" | "income";

/**
 * The hero interaction: sign toggle → amount → category chip → COMMIT.
 * Amount is in the selected account's currency; converted preview shown passively.
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
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const create = useCreateTransaction();

  const rail = useMemo(
    () => (categories ?? []).filter((c) => c.type === mode),
    [categories, mode],
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

  const ccWarning =
    mode === "expense" && account?.subtype === "credit_card"
      ? "Logging to Credit Card — adds to outstanding"
      : null;

  async function commit() {
    setError(null);
    if (!account) return setError("Select an account to spend from");
    if (!amount) return setError("Enter an amount");
    const cat = rail.find((c) => c.id === categoryId) ?? null;
    try {
      parseAmount(amount, account.currency.exponent); // validate locally first
      await create.mutateAsync({
        accountId: account.id,
        type: mode,
        amount,
        categoryId: cat?.id,
        date: todayISO(),
      });
      setAmount("");
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log");
    }
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border bg-card p-3 transition-colors sm:gap-3.5",
          flash ? "border-pos/60" : "border-border-2",
        )}
      >
        {/* sign toggle */}
        <div className="flex flex-none gap-[3px] rounded-[11px] border border-border-3 bg-surface p-[3px]">
          {(
            [
              ["expense", "−"],
              ["income", "+"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setCategoryId(null);
              }}
              className={cn(
                "num h-8 w-8 rounded-lg text-base font-bold",
                mode === m
                  ? m === "expense"
                    ? "bg-neg/15 text-neg"
                    : "bg-pos/15 text-pos"
                  : "text-faint",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* amount */}
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          inputMode="decimal"
          placeholder={account ? (0).toFixed(account.currency.exponent) : "0.000"}
          className={cn(
            "num w-[104px] flex-none rounded-[11px] border bg-surface px-3 py-2.5 text-right text-base outline-none sm:w-[128px]",
            ccWarning ? "border-neg/55" : "border-border-3",
            mode === "income" ? "text-pos" : "text-ink",
          )}
        />

        {/* category rail */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="hs flex gap-2 overflow-x-auto p-0.5 pr-6">
            {rail.map((c) => {
              const sel = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(sel ? null : c.id)}
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
          disabled={create.isPending}
          className="flex-none rounded-[11px] bg-ink px-5 py-3 text-[12.5px] font-bold tracking-[1.5px] text-surface hover:bg-white disabled:opacity-60 sm:px-6"
        >
          {create.isPending ? "…" : "COMMIT"}
        </button>
      </div>

      <div className="num mt-1.5 flex min-h-[15px] items-center gap-4 px-4 text-[10.5px]">
        {account && (
          <span className="text-faint">
            {mode === "expense" ? "From" : "Into"}: {account.name} ({account.currencyCode})
          </span>
        )}
        {preview && <span className="text-faint">{preview}</span>}
        {ccWarning && <span className="text-neg">{ccWarning}</span>}
        {error && <span className="text-neg">{error}</span>}
        {flash && <span className="text-pos">Logged ✓</span>}
      </div>
    </div>
  );
}
