"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CardSkeleton } from "@/shell/Skeleton";
import { LoadError } from "@/shell/LoadError";
import { masked, usePrivacy } from "@/shell/privacy";
import { fmt, humanDay } from "@/lib/format-money";
import {
  useCurrencies,
  useTransactions,
  type TransactionFilters,
} from "../api/hooks";
import type { TransactionDto } from "../types";
import { Icon } from "./Icon";
import { TransactionSheet } from "./TransactionSheet";

const SIGN: Record<TransactionDto["type"], -1 | 1> = {
  expense: -1,
  transfer_out: -1,
  income: 1,
  transfer_in: 1,
  adjustment: 1,
  refund: 1,
};

export function TransactionList({
  accountId,
  filters,
  limit,
}: {
  accountId?: string;
  filters?: TransactionFilters;
  limit?: number;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useTransactions(filters ?? (accountId ? { accountId } : undefined));
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const [openTxn, setOpenTxn] = useState<TransactionDto | null>(null);

  if (isLoading) return <CardSkeleton rows={limit ? 4 : 8} />;
  // a fetch failure must never masquerade as an empty ledger
  if (isError) return <LoadError retry={refetch} />;

  let items = data?.pages.flatMap((p) => p.items) ?? [];
  if (limit) items = items.slice(0, limit);
  if (items.length === 0) {
    return <p className="py-2 text-xs text-faint">No transactions here yet.</p>;
  }

  const exponentOf = (code: string) =>
    currencyData?.currencies.find((c) => c.code === code)?.exponent ?? 2;
  const defExponent = currencyData
    ? exponentOf(currencyData.defaultCurrency)
    : 3;

  const renderRow = (t: TransactionDto) => (
    <TransactionRow
      key={t.id}
      txn={t}
      exponent={exponentOf(t.currencyCode)}
      onOpen={() => setOpenTxn(t)}
    />
  );

  const sheet = openTxn && (
    <TransactionSheet txn={openTxn} onClose={() => setOpenTxn(null)} />
  );

  // dashboard (limited) view stays flat; the full page groups by day with net totals
  if (limit) {
    return (
      <div className="flex flex-col gap-0.5">
        {items.map(renderRow)}
        {sheet}
      </div>
    );
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
          <div className="num mt-3 flex items-center justify-between border-b border-border px-1.5 pb-1.5 text-[11px] text-muted first:mt-0">
            <span>
              {["Today", "Yesterday"].includes(humanDay(g.date))
                ? humanDay(g.date)
                : new Date(g.date + "T00:00:00").toLocaleDateString("en", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
            </span>
            <span className={cn(g.netDefault < 0 ? "text-muted" : "text-pos")}>
              {g.netDefault < 0 ? "−" : "+"}
              {masked(privacy, fmt(Math.abs(g.netDefault), { exponent: defExponent }))}{" "}
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
      {sheet}
    </div>
  );
}

function TransactionRow({
  txn: t,
  exponent,
  onOpen,
}: {
  txn: TransactionDto;
  exponent: number;
  onOpen: () => void;
}) {
  const { privacy } = usePrivacy();
  // adjustments carry their own sign in amountMinor; other types derive it
  const sign = t.type === "adjustment" ? (t.amountMinor < 0 ? -1 : 1) : SIGN[t.type];
  const base =
    t.category?.name ??
    (t.type === "transfer_out"
      ? "Transfer out"
      : t.type === "transfer_in"
        ? "Transfer in"
        : t.type === "adjustment"
          ? "Balance correction"
          : "Uncategorized");
  const label = t.type === "refund" ? `Refund — ${base}` : base;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[9px] px-1.5 py-2.5 text-left hover:bg-card-hover"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-inset text-muted">
        <Icon name={t.category?.icon ?? "other"} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink-2">
          {label}
        </span>
        <span className="num mt-0.5 block truncate text-[11.5px] text-muted">
          {humanDay(t.date)} · {t.account.name}
          {t.note ? ` · ${t.note}` : ""}
        </span>
      </span>
      {/* spending is normal life, not an alarm — red is reserved for problems */}
      <span className={cn("num text-[14px]", sign < 0 ? "text-ink" : "text-pos")}>
        {sign < 0 ? "−" : "+"}
        {masked(privacy, fmt(Math.abs(t.amountMinor), { exponent }))} {t.currencyCode}
      </span>
      <span className="flex-none text-ghost">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </button>
  );
}
