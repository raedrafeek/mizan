"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CardSkeleton } from "@/shell/Skeleton";
import { fmt } from "@/lib/format-money";
import {
  useCategories,
  useCurrencies,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "../api/hooks";
import type { TransactionDto } from "../types";
import { Icon } from "./Icon";

const SIGN: Record<TransactionDto["type"], -1 | 1> = {
  expense: -1,
  transfer_out: -1,
  income: 1,
  transfer_in: 1,
  adjustment: 1,
};

export function TransactionList({
  accountId,
  limit,
}: {
  accountId?: string;
  limit?: number;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTransactions(accountId ? { accountId } : undefined);
  const { data: currencyData } = useCurrencies();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) return <CardSkeleton rows={limit ? 4 : 8} />;

  let items = data?.pages.flatMap((p) => p.items) ?? [];
  if (limit) items = items.slice(0, limit);
  if (items.length === 0) {
    return <p className="py-2 text-xs text-faint">No transactions yet — log one above.</p>;
  }

  const exponentOf = (code: string) =>
    currencyData?.currencies.find((c) => c.code === code)?.exponent ?? 2;
  const defExponent = currencyData
    ? exponentOf(currencyData.defaultCurrency)
    : 3;

  const renderRow = (t: TransactionDto) =>
    editingId === t.id ? (
      <TransactionEditRow key={t.id} txn={t} onClose={() => setEditingId(null)} />
    ) : (
      <TransactionRow
        key={t.id}
        txn={t}
        exponent={exponentOf(t.currencyCode)}
        onEdit={() => setEditingId(t.id)}
      />
    );

  // dashboard (limited) view stays flat; the full page groups by day with net totals
  if (limit) {
    return <div className="flex flex-col gap-0.5">{items.map(renderRow)}</div>;
  }

  const groups: { date: string; items: TransactionDto[]; netDefault: number }[] = [];
  for (const t of items) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.date) {
      g = { date: t.date, items: [], netDefault: 0 };
      groups.push(g);
    }
    g.items.push(t);
    const sign = t.type === "adjustment" ? Math.sign(t.amountMinor) || 1 : SIGN[t.type];
    g.netDefault += sign * Math.abs(t.amountDefaultMinor);
  }

  return (
    <div className="flex flex-col gap-0.5">
      {groups.map((g) => (
        <div key={g.date}>
          <div className="num mt-3 flex items-center justify-between border-b border-border px-1.5 pb-1.5 text-[10px] text-faint first:mt-0">
            <span>
              {new Date(g.date + "T00:00:00").toLocaleDateString("en", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            <span className={cn(g.netDefault < 0 ? "text-neg" : "text-pos")}>
              {g.netDefault < 0 ? "−" : "+"}
              {fmt(Math.abs(g.netDefault), { exponent: defExponent })}{" "}
              {currencyData?.defaultCurrency}
            </span>
          </div>
          {g.items.map(renderRow)}
        </div>
      ))}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-2 self-center rounded-lg border border-border-3 px-4 py-1.5 text-xs text-muted hover:text-ink"
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function TransactionRow({
  txn: t,
  exponent,
  onEdit,
}: {
  txn: TransactionDto;
  exponent: number;
  onEdit: () => void;
}) {
  const del = useDeleteTransaction();
  // adjustments carry their own sign in amountMinor; other types derive it
  const sign = t.type === "adjustment" ? (t.amountMinor < 0 ? -1 : 1) : SIGN[t.type];
  const label =
    t.category?.name ??
    (t.type === "transfer_out"
      ? "Transfer out"
      : t.type === "transfer_in"
        ? "Transfer in"
        : t.type === "adjustment"
          ? "Adjustment"
          : "Uncategorized");
  return (
    <div className="group flex items-center gap-2.5 rounded-[9px] px-1.5 py-2 hover:bg-card-hover">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-inset text-muted">
        <Icon name={t.category?.icon ?? "other"} size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-ink-2">
          {label}
        </span>
        <span className="num mt-0.5 block text-[10px] text-faint">
          {t.date} · {t.account.name}
          {t.note ? ` · ${t.note}` : ""}
        </span>
      </span>
      <span className={cn("num text-[12.5px]", sign < 0 ? "text-neg" : "text-pos")}>
        {sign < 0 ? "−" : "+"}
        {fmt(Math.abs(t.amountMinor), { exponent })} {t.currencyCode}
      </span>
      <span className="flex gap-1 opacity-0 group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="rounded p-1 text-ghost hover:text-muted"
          aria-label="Edit"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.8 3.7a2.2 2.2 0 0 1 3.1 3.1L7.5 19.2 3 20.5l1.3-4.5z" />
          </svg>
        </button>
        <button
          onClick={() => {
            if (confirm(t.transferGroupId ? "Delete both legs of this transfer?" : "Delete this transaction?")) {
              del.mutate(t.id);
            }
          }}
          className="rounded p-1 text-ghost hover:text-neg"
          aria-label="Delete"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 7h16 M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2 M6.5 7l1 13h9l1-13" />
          </svg>
        </button>
      </span>
    </div>
  );
}

function TransactionEditRow({
  txn: t,
  onClose,
}: {
  txn: TransactionDto;
  onClose: () => void;
}) {
  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const update = useUpdateTransaction();
  const exponent =
    currencyData?.currencies.find((c) => c.code === t.currencyCode)?.exponent ?? 2;

  const [amount, setAmount] = useState(
    (Math.abs(t.amountMinor) / 10 ** exponent).toFixed(exponent),
  );
  const [date, setDate] = useState(t.date);
  const [note, setNote] = useState(t.note ?? "");
  const [categoryId, setCategoryId] = useState(t.categoryId ?? "");
  const [err, setErr] = useState<string | null>(null);

  const catType = t.type === "income" ? "income" : "expense";
  const cats = (categories ?? []).filter((c) => c.type === catType);
  const isTransfer = !!t.transferGroupId;

  async function save() {
    setErr(null);
    try {
      await update.mutateAsync({
        id: t.id,
        amount,
        date,
        note: note || null,
        categoryId: isTransfer ? undefined : categoryId || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="rounded-[9px] border border-border-3 bg-card-hover p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="num w-28 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-sm outline-none"
        />
        <span className="num text-xs text-faint">{t.currencyCode}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="num rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
        {!isTransfer && (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="">Uncategorized</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note…"
          className="min-w-32 flex-1 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
        <button
          onClick={save}
          disabled={update.isPending}
          className="rounded-lg bg-ink px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-surface disabled:opacity-60"
        >
          SAVE
        </button>
        <button onClick={onClose} className="px-2 py-1.5 text-[11px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
      {err && <p className="num mt-1.5 text-[10.5px] text-neg">{err}</p>}
    </div>
  );
}
