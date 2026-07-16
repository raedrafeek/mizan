"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { cn } from "@/lib/cn";
import { fmt, todayISO } from "@/lib/format-money";
import { parseAmount, convertMinor, formatMinor } from "@/lib/money";
import { masked, usePrivacy } from "@/shell/privacy";
import { Skeleton } from "@/shell/Skeleton";
import { useToast } from "@/shell/toast";
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useCurrencies,
  useDeleteTransaction,
} from "../api/hooks";
import { Icon } from "./Icon";

type Mode = "expense" | "income" | "transfer";

const ACCOUNT_KEY = "mizan.spendFrom";
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
  return date.slice(5);
}

/**
 * The phone log moment: amount-first numpad, category grid, one COMMIT.
 * Modes: SPENT / RECEIVED / MOVED (transfers, with an honest
 * "how much actually arrived?" field on cross-currency moves).
 * Commit is optimistic; the toast offers UNDO instead of asking first.
 */
export function NumpadLog() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const create = useCreateTransaction();
  const del = useDeleteTransaction();
  const toast = useToast();
  const qc = useQueryClient();
  const { privacy } = usePrivacy();

  const [mode, setMode] = useState<Mode>("expense");
  const [isRefund, setIsRefund] = useState(false); // RECEIVED-mode: money back against spending
  const [amountStr, setAmountStr] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [dateOpen, setDateOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [counterId, setCounterId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  // split: one payment fanned into parts (other categories / owed-to-you accounts)
  const [splitOpen, setSplitOpen] = useState(false);
  const [splits, setSplits] = useState<{ target: string; amountStr: string }[]>([]);
  const dateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(ACCOUNT_KEY);
    if (saved) setAccountId(saved);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const transactional = useMemo(
    () => (accounts ?? []).filter((a) => a.kind === "transactional"),
    [accounts],
  );
  const account =
    transactional.find((a) => a.id === accountId) ?? transactional[0] ?? null;
  const exponent = account?.currency.exponent ?? 3;
  const counterAccounts = useMemo(
    () => transactional.filter((a) => a.id !== account?.id),
    [transactional, account],
  );
  const counter = counterAccounts.find((a) => a.id === counterId) ?? null;

  // usage-ordered category rail; one is ALWAYS selected (no uncategorized logs).
  // refunds pick from EXPENSE categories — the money goes back where it came from
  const wantIncomeCats = mode === "income" && !isRefund;
  const rail = useMemo(() => {
    const usage = typeof window === "undefined" ? {} : readUsage();
    return (categories ?? [])
      .filter((c) => c.type === (wantIncomeCats ? "income" : "expense"))
      .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.sortOrder - b.sortOrder);
  }, [categories, wantIncomeCats]);

  useEffect(() => {
    if (mode === "transfer" || rail.length === 0) return;
    if (categoryId && rail.some((c) => c.id === categoryId)) return;
    const saved = localStorage.getItem(`${LAST_CAT_KEY}.${wantIncomeCats ? "income" : "expense"}`);
    setCategoryId((rail.find((c) => c.id === saved) ?? rail[0]).id);
  }, [rail, mode, categoryId, wantIncomeCats]);

  // numpad input
  function press(key: string) {
    if (key === "back") {
      setAmountStr((s) => s.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (exponent === 0) return;
      setAmountStr((s) => (s.indexOf(".") >= 0 ? s : (s || "0") + "."));
      return;
    }
    setAmountStr((s) => {
      const dot = s.indexOf(".");
      if (dot >= 0 && s.length - dot > exponent) return s; // decimals capped by currency
      if (dot < 0 && s.replace(".", "").length >= 7) return s;
      return (s === "0" ? "" : s) + key;
    });
  }

  // physical keyboard works too (desktop / hardware keys)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === ".") press(".");
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") commit();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountStr, mode, categoryId, counterId, counterAmount, date, note, account?.id]);

  const amountValid = (() => {
    if (!amountStr || !account) return false;
    try {
      return parseAmount(amountStr, exponent) > 0;
    } catch {
      return false;
    }
  })();

  const preview = useMemo(() => {
    if (!account || !currencyData || !amountValid) return null;
    if (account.currencyCode === currencyData.defaultCurrency) return null;
    const rate = currencyData.rates[account.currencyCode];
    if (!rate || new Decimal(rate.rate).lte(0)) return null;
    const defCur = currencyData.currencies.find(
      (c) => c.code === currencyData.defaultCurrency,
    );
    if (!defCur) return null;
    try {
      const minor = parseAmount(amountStr, exponent);
      const converted = convertMinor(minor, rate.rate, exponent, defCur.exponent);
      return `≈ ${formatMinor(converted, defCur.exponent)} ${defCur.code}`;
    } catch {
      return null;
    }
  }, [amountStr, amountValid, account, currencyData, exponent]);

  const canCommit =
    amountValid &&
    !!account &&
    (mode === "transfer" ? !!counter : !!categoryId) &&
    !create.isPending;

  async function commit() {
    if (!canCommit || !account) return;
    const payload = {
      accountId: account.id,
      type: (mode === "transfer"
        ? "transfer_out"
        : mode === "income" && isRefund
          ? "refund"
          : mode) as "expense" | "income" | "transfer_out" | "refund",
      amount: amountStr,
      categoryId: mode === "transfer" ? undefined : categoryId!,
      counterAccountId: mode === "transfer" ? counter!.id : undefined,
      counterAmount:
        mode === "transfer" && counterAmount ? counterAmount : undefined,
      date,
      note: note || undefined,
    };
    const label =
      mode === "transfer"
        ? `Moved ${amountStr} ${account.currencyCode} → ${counter!.name}`
        : mode === "income" && isRefund
          ? `Refund +${amountStr} ${account.currencyCode}`
          : `Logged ${mode === "expense" ? "−" : "+"}${amountStr} ${account.currencyCode}`;

    // optimistic: clear instantly (date + category + account stay for batch logging)
    setAmountStr("");
    setCounterAmount("");
    setNote("");
    setNoteOpen(false);
    if (mode !== "transfer" && categoryId) {
      bumpUsage(categoryId);
      if (!isRefund) localStorage.setItem(`${LAST_CAT_KEY}.${mode}`, categoryId);
    }
    if (navigator.vibrate) navigator.vibrate(12);

    try {
      const created = (await create.mutateAsync(payload)) as { id: string };
      toast.success(label, {
        label: "UNDO",
        onClick: () => del.mutate(created.id),
      });
    } catch (e) {
      setAmountStr(payload.amount);
      toast.error(
        `Not logged: ${e instanceof Error ? e.message : "request failed"} — your entry was restored`,
      );
    }
  }

  // ---- split helpers ----
  const receivableAccounts = transactional.filter(
    (a) => a.id !== account?.id && (a.subtype === "other" || a.subtype === "loan"),
  );
  const toMinor = (s: string) => {
    try {
      return parseAmount(s, exponent);
    } catch {
      return NaN;
    }
  };
  const toMajor = (m: number) => (m / 10 ** exponent).toFixed(exponent);
  const totalMinor = amountValid ? toMinor(amountStr) : 0;
  const partsMinor = splits.map((s) => (s.amountStr ? toMinor(s.amountStr) : 0));
  const partsValid = splits.every(
    (s, i) => s.target && !isNaN(partsMinor[i]) && partsMinor[i] > 0,
  );
  const partsSum = partsMinor.reduce((a, b) => (isNaN(b) ? a : a + b), 0);
  const remainderMinor = totalMinor - partsSum;
  const mainCat = rail.find((c) => c.id === categoryId);

  async function commitSplit() {
    if (!account || !partsValid || remainderMinor < 0) return;
    const parts: { type: "expense" | "transfer_out"; amount: string; categoryId?: string; counterAccountId?: string }[] =
      splits.map((s, i) => {
        const [kind, id] = s.target.split(":");
        return kind === "cat"
          ? { type: "expense" as const, amount: toMajor(partsMinor[i]), categoryId: id }
          : { type: "transfer_out" as const, amount: toMajor(partsMinor[i]), counterAccountId: id };
      });
    if (remainderMinor > 0 && categoryId) {
      parts.unshift({ type: "expense", amount: toMajor(remainderMinor), categoryId });
    }
    setSplitOpen(false);
    setAmountStr("");
    setNote("");
    setNoteOpen(false);
    if (navigator.vibrate) navigator.vibrate(12);
    try {
      // atomic: all parts or none
      const res = await fetch("/api/finance/transactions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          date,
          note: note || undefined,
          parts,
        }),
      });
      const body = (await res.json()) as { ids?: string[]; error?: unknown };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Split failed");
      }
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["cashflow"] });
      qc.invalidateQueries({ queryKey: ["networth"] });
      toast.success(`Split ${toMajor(totalMinor)} into ${parts.length} parts`, {
        label: "UNDO",
        onClick: () => (body.ids ?? []).forEach((id) => del.mutate(id)),
      });
    } catch (e) {
      toast.error(
        `Nothing was logged: ${e instanceof Error ? e.message : "request failed"}`,
      );
    }
  }

  const yesterday = new Date(new Date(todayISO() + "T00:00:00").getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <Skeleton className="h-10 w-48 self-center rounded-xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (!account) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        Add an account first on the Accounts tab.
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col">
      {/* immersive sheet chrome on phones: grab handle + close */}
      <div className="relative mb-3 md:hidden">
        <span className="mx-auto block h-1 w-9 rounded-full bg-border-4" />
        <button
          onClick={() => (history.length > 1 ? history.back() : (location.href = "/"))}
          aria-label="Close"
          className="absolute -top-1.5 right-0 px-2 text-[19px] leading-none text-faint hover:text-ink"
        >
          ×
        </button>
      </div>

      {/* mode */}
      <div className="mx-auto flex gap-1 rounded-xl border border-border-3 bg-surface p-1">
        {(
          [
            ["expense", "SPENT", "text-neg"],
            ["income", "RECEIVED", "text-pos"],
            ["transfer", "MOVED", "text-ink"],
          ] as const
        ).map(([m, label, cls]) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setIsRefund(false);
              setCategoryId(null);
              setCounterId(null);
            }}
            className={cn(
              "rounded-lg px-4 py-1.5 text-[11px] font-bold tracking-[0.8px]",
              mode === m ? cn("bg-inset-2", cls) : "text-faint",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* amount */}
      <div className="py-5 text-center">
        <p
          className={cn(
            "num text-[44px] font-semibold leading-none tracking-tight",
            amountStr ? (mode === "income" ? "text-pos" : "text-ink") : "text-ghost",
          )}
        >
          {amountStr || (0).toFixed(exponent)}
          <span className="ml-2 text-lg font-medium text-faint">{account.currencyCode}</span>
        </p>
        <p className="num mt-1.5 min-h-[15px] text-[11px] text-faint">{preview}</p>
      </div>

      {/* context chips */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-border-3 bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted"
        >
          <Icon name={account.icon} size={12} />
          {account.name} ▾
        </button>
        <div ref={dateRef} className="relative">
          <button
            onClick={() => setDateOpen((v) => !v)}
            className={cn(
              "num rounded-full border border-border-3 bg-surface px-3 py-1.5 text-[11px] font-semibold",
              date === todayISO() ? "text-muted" : "text-warn",
            )}
          >
            {dateLabel(date)} ▾
          </button>
          {dateOpen && (
            <div className="absolute left-1/2 top-9 z-40 flex w-40 -translate-x-1/2 flex-col gap-1 rounded-xl border border-border-4 bg-card p-2 shadow-2xl">
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
        {mode === "expense" && (
          <button
            onClick={() => {
              if (!amountValid) return;
              setSplits([{ target: "", amountStr: "" }]);
              setSplitOpen(true);
            }}
            disabled={!amountValid}
            className="rounded-full border border-border-3 bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted disabled:opacity-40"
            title="One payment, several parts — other categories or money owed back to you"
          >
            ◫ split
          </button>
        )}
        {mode === "income" && (
          <button
            onClick={() => {
              setIsRefund((v) => !v);
              setCategoryId(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold",
              isRefund
                ? "border-pos/50 bg-pos/10 text-pos"
                : "border-border-3 bg-surface text-muted",
            )}
            title="Money back against something you spent — nets out of that category instead of counting as income"
          >
            ↩ refund
          </button>
        )}
        {noteOpen ? (
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => !note && setNoteOpen(false)}
            placeholder="Note…"
            className="w-32 rounded-full border border-border-3 bg-surface px-3 py-1.5 text-[11px] text-ink outline-none"
          />
        ) : (
          <button
            onClick={() => setNoteOpen(true)}
            className="rounded-full border border-border-3 bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted"
          >
            ＋ note
          </button>
        )}
      </div>

      {/* category grid / destination grid */}
      {mode !== "transfer" ? (
        <div className="hs mb-4 grid max-h-[176px] grid-cols-4 gap-2 overflow-y-auto">
          {rail.map((c) => {
            const sel = categoryId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5",
                  sel ? "border-border-4 bg-card" : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    sel ? "bg-ink text-surface" : "bg-card text-muted",
                  )}
                >
                  <Icon name={c.icon} size={16} />
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[10.5px] font-semibold",
                    sel ? "text-ink" : "text-muted",
                  )}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          <div className="hs grid max-h-[140px] grid-cols-2 gap-2 overflow-y-auto">
            {counterAccounts.map((a) => {
              const sel = counterId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setCounterId(sel ? null : a.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left",
                    sel ? "border-ink bg-ink text-surface" : "border-border-3 bg-card text-muted",
                  )}
                >
                  <span className="text-[10px]">→</span>
                  <Icon name={a.icon} size={13} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">{a.name}</span>
                  <span className={cn("num text-[9px]", sel ? "text-surface/70" : "text-faint")}>
                    {a.currencyCode}
                  </span>
                </button>
              );
            })}
          </div>
          {counter && counter.currencyCode !== account.currencyCode && (
            <input
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              inputMode="decimal"
              placeholder={`How much actually arrived? (${counter.currencyCode} — empty = mid-market rate)`}
              className="num rounded-xl border border-border-3 bg-surface px-3.5 py-2.5 text-[12px] text-ink outline-none"
            />
          )}
        </div>
      )}

      {/* numpad */}
      <div className="grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            aria-label={k === "back" ? "Delete digit" : k}
            className="num rounded-2xl py-3.5 text-[22px] font-medium text-ink-2 active:bg-card"
          >
            {k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>

      <button
        onClick={commit}
        disabled={!canCommit}
        className="mt-3 w-full rounded-2xl bg-ink py-4 text-[13px] font-bold tracking-[2.5px] text-surface transition-transform active:scale-[.98] disabled:opacity-35"
      >
        LOG
      </button>

      {/* split sheet */}
      {splitOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSplitOpen(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border-4 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl">
            <p className="text-[10.5px] font-bold tracking-[2px] text-faint">
              SPLIT {toMajor(totalMinor)} {account.currencyCode}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              Break this payment into parts — other categories, or money someone owes you
              back.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {splits.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={s.target}
                    onChange={(e) =>
                      setSplits((list) =>
                        list.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1 rounded-xl border border-border-3 bg-surface px-2.5 py-2.5 text-xs text-ink outline-none"
                  >
                    <option value="">Goes to…</option>
                    <optgroup label="Category">
                      {rail.map((c) => (
                        <option key={c.id} value={`cat:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    {receivableAccounts.length > 0 && (
                      <optgroup label="Owed back to you">
                        {receivableAccounts.map((a) => (
                          <option key={a.id} value={`acct:${a.id}`}>
                            → {a.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <input
                    value={s.amountStr}
                    onChange={(e) =>
                      setSplits((list) =>
                        list.map((x, j) => (j === i ? { ...x, amountStr: e.target.value } : x)),
                      )
                    }
                    inputMode="decimal"
                    placeholder="0"
                    className="num w-24 rounded-xl border border-border-3 bg-surface px-2.5 py-2.5 text-right text-xs text-ink outline-none"
                  />
                  <button
                    onClick={() => setSplits((list) => list.filter((_, j) => j !== i))}
                    className="px-1 text-[16px] leading-none text-faint hover:text-neg"
                    aria-label="Remove part"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setSplits((list) => [...list, { target: "", amountStr: "" }])}
              className="mt-2 text-[11.5px] font-semibold text-muted hover:text-ink"
            >
              ＋ add another part
            </button>

            <p className="num mt-3 text-[11.5px] text-muted">
              {remainderMinor > 0 ? (
                <>
                  Remainder <b className="text-ink">{toMajor(remainderMinor)}</b> stays in{" "}
                  <b className="text-ink">{mainCat?.name ?? "the selected category"}</b>
                </>
              ) : remainderMinor === 0 ? (
                "Fully split — no remainder"
              ) : (
                <span className="text-neg">Parts exceed the total by {toMajor(-remainderMinor)}</span>
              )}
            </p>

            <div className="mt-4 flex items-center gap-2.5">
              <button
                onClick={commitSplit}
                disabled={!partsValid || remainderMinor < 0 || splits.length === 0 || create.isPending}
                className="flex-1 rounded-xl bg-ink py-3 text-[11.5px] font-bold tracking-[1.5px] text-surface disabled:opacity-40"
              >
                LOG {splits.length + (remainderMinor > 0 ? 1 : 0)} PARTS
              </button>
              <button
                onClick={() => setSplitOpen(false)}
                className="px-3 text-[11.5px] text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* account picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border-4 bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-3xl">
            <p className="mb-2 px-1 text-[10.5px] font-bold tracking-[2px] text-faint">
              {mode === "income" ? "INTO" : "FROM"} ACCOUNT
            </p>
            {transactional.map((a) => {
              const sel = a.id === account.id;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    setAccountId(a.id);
                    localStorage.setItem(ACCOUNT_KEY, a.id);
                    if (counterId === a.id) setCounterId(null);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
                    sel ? "bg-inset" : "hover:bg-card-hover",
                  )}
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-inset-2 text-muted">
                    <Icon name={a.icon} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink-2">
                      {a.name}
                    </span>
                    <span className="text-[10px] text-faint">{a.currencyCode}</span>
                  </span>
                  {a.balance && (
                    <span className="num text-[12px] text-muted">
                      {masked(privacy, fmt(a.balance.balanceMinor, a.currency))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
