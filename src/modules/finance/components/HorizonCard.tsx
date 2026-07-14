"use client";

import { useState } from "react";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { useAccounts, useCategories, useCurrencies } from "../api/hooks";
import {
  useCreateHorizonItem,
  useDeleteHorizonItem,
  useHorizon,
  useLogHorizonItem,
  type HorizonItemDto,
} from "../api/hooks-m3";

export function HorizonCard() {
  const { data: items } = useHorizon();
  const [adding, setAdding] = useState(false);

  return (
    <Card
      title="FINANCIAL HORIZON"
      right={
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11.5px] text-muted hover:text-ink"
        >
          {adding ? "close" : "+ new"}
        </button>
      }
    >
      {adding && <HorizonForm onDone={() => setAdding(false)} />}
      <div className="flex flex-col gap-0.5">
        {(items ?? []).length === 0 && !adding && (
          <p className="text-xs text-faint">
            Nothing scheduled — add future one-offs like school fees or renewals.
          </p>
        )}
        {(items ?? []).map((h) => (
          <HorizonRow key={h.id} item={h} />
        ))}
      </div>
    </Card>
  );
}

function HorizonRow({ item: h }: { item: HorizonItemDto }) {
  const { data: currencyData } = useCurrencies();
  const log = useLogHorizonItem();
  const del = useDeleteHorizonItem();
  const [err, setErr] = useState<string | null>(null);
  const exponent =
    currencyData?.currencies.find((c) => c.code === h.currencyCode)?.exponent ?? 2;
  const out = h.direction === "outflow";

  return (
    <div className="group rounded-[9px] px-1.5 py-2 hover:bg-card-hover">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg",
            h.warn ? "bg-warn/10 text-warn" : "bg-inset text-faint",
          )}
        >
          {h.warn ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4.5 M12 17h.01" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5.5h16v15H4z M8 3v4 M16 3v4 M4 10h16" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-ink-2">
            {h.name}
            {h.recurrence && (
              <span className="num ml-1.5 text-[9px] tracking-[1px] text-faint">
                {h.recurrence.toUpperCase()}
              </span>
            )}
          </span>
          <span className="num mt-0.5 block text-[10px] text-faint">
            {h.dueDate}
            <span className={cn(h.warn ? "text-warn" : "text-faint")}>
              {" "}· {h.daysUntil < 0 ? `${-h.daysUntil}d OVERDUE` : `${h.daysUntil} DAYS`}
            </span>
          </span>
        </span>
        <span className={cn("num text-[12.5px]", out ? "text-neg" : "text-pos")}>
          {out ? "−" : "+"}
          {formatMinor(h.amountMinor, exponent)} {h.currencyCode}
        </span>
        <span className="touch-show-flex hidden flex-col gap-1 group-hover:flex">
          <button
            onClick={async () => {
              setErr(null);
              try {
                await log.mutateAsync(h.id);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed");
              }
            }}
            disabled={log.isPending}
            className="rounded bg-ink px-2 py-0.5 text-[9px] font-bold tracking-[1px] text-surface disabled:opacity-50"
          >
            LOG NOW
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${h.name}"?`)) del.mutate(h.id);
            }}
            className="text-[9px] font-bold tracking-[1px] text-faint hover:text-neg"
          >
            DEL
          </button>
        </span>
      </div>
      {err && <p className="num mt-1 pl-9 text-[10px] text-neg">{err}</p>}
    </div>
  );
}

function HorizonForm({ onDone }: { onDone: () => void }) {
  const create = useCreateHorizonItem();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"outflow" | "inflow">("outflow");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("KWD");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const cats = (categories ?? []).filter(
    (c) => c.type === (direction === "outflow" ? "expense" : "income"),
  );

  async function submit() {
    setErr(null);
    try {
      await create.mutateAsync({
        name,
        direction,
        amount,
        currencyCode,
        dueDate,
        recurrence: (recurrence || undefined) as "monthly" | "yearly" | undefined,
        accountId: accountId || undefined,
        categoryId: categoryId || undefined,
        alertDaysBefore: 7,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border-3 bg-card-hover p-3">
      <div className="flex gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "outflow" | "inflow")}
          className="rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          <option value="outflow">− Payment</option>
          <option value="inflow">+ Income</option>
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. School fees — Term 1)"
          className="flex-1 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
      </div>
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Amount"
          className="num w-24 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs outline-none"
        />
        <select
          value={currencyCode}
          onChange={(e) => setCurrencyCode(e.target.value)}
          className="rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          {(currencyData?.currencies ?? [])
            .filter((c) => c.isFiat)
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="num flex-1 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
          className="rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          <option value="">One-off</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>
      <div className="flex gap-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="flex-1 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          <option value="">Account for &quot;log now&quot; (optional)</option>
          {(accounts ?? [])
            .filter((a) => a.kind === "transactional")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="flex-1 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          <option value="">Category (optional)</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {err && <p className="num text-[10.5px] text-neg">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={create.isPending || !name || !amount || !dueDate}
          className="rounded-lg bg-ink px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-surface disabled:opacity-60"
        >
          ADD
        </button>
        <button onClick={onDone} className="px-2 text-[11px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
