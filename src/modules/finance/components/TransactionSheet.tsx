"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ConfirmButton } from "@/shell/ConfirmButton";
import { useToast } from "@/shell/toast";
import {
  useCategories,
  useCurrencies,
  useDeleteTransaction,
  useUpdateTransaction,
} from "../api/hooks";
import type { TransactionDto } from "../types";
import { Icon } from "./Icon";

const TYPE_LABEL: Record<TransactionDto["type"], string> = {
  expense: "Spent",
  income: "Received",
  transfer_out: "Moved out",
  transfer_in: "Moved in",
  adjustment: "Balance correction",
  refund: "Refund (nets out of the category's spending)",
};

/**
 * Tap-through detail for a transaction: the mobile list→detail grammar.
 * Bottom sheet on phones, centered on desktop. Edit amount/category/date/note,
 * or delete (transfers delete both legs).
 */
export function TransactionSheet({
  txn: t,
  onClose,
}: {
  txn: TransactionDto;
  onClose: () => void;
}) {
  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const toast = useToast();
  const exponent =
    currencyData?.currencies.find((c) => c.code === t.currencyCode)?.exponent ?? 2;

  const [amount, setAmount] = useState(
    (Math.abs(t.amountMinor) / 10 ** exponent).toFixed(exponent),
  );
  const [date, setDate] = useState(t.date);
  const [note, setNote] = useState(t.note ?? "");
  const [categoryId, setCategoryId] = useState(t.categoryId ?? "");
  const [err, setErr] = useState<string | null>(null);

  const isTransfer = !!t.transferGroupId;
  const catType = t.type === "income" ? "income" : "expense";
  const cats = (categories ?? []).filter((c) => c.type === catType);
  const canCategorize = !isTransfer && t.type !== "adjustment";

  async function save() {
    setErr(null);
    try {
      await update.mutateAsync({
        id: t.id,
        amount,
        date,
        note: note || null,
        categoryId: canCategorize ? categoryId || null : undefined,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove() {
    setErr(null);
    try {
      await del.mutateAsync(t.id);
      toast.success("Deleted");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl border border-border-4 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-inset text-muted">
            <Icon name={t.category?.icon ?? "other"} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-ink-2">
              {t.category?.name ?? TYPE_LABEL[t.type]}
            </p>
            <p className="num mt-0.5 text-[10.5px] text-faint">
              {TYPE_LABEL[t.type]} · {t.account.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-1 text-[18px] leading-none text-faint hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="num w-32 rounded-xl border border-border-3 bg-surface px-3 py-2.5 text-right text-[15px] text-ink outline-none"
            />
            <span className="num text-xs text-faint">{t.currencyCode}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="num flex-1 rounded-xl border border-border-3 bg-surface px-3 py-2.5 text-xs text-ink outline-none"
            />
          </div>
          {canCategorize && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-xl border border-border-3 bg-surface px-3 py-2.5 text-xs text-ink outline-none"
            >
              <option value="">No category</option>
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
            className="rounded-xl border border-border-3 bg-surface px-3 py-2.5 text-xs text-ink outline-none"
          />
          {t.type === "adjustment" && (
            <p className="text-[10.5px] leading-relaxed text-muted">
              This correction {t.amountMinor < 0 ? "decreases" : "increases"} the balance —
              editing the amount keeps that direction.
            </p>
          )}
          {isTransfer && (
            <p className="text-[10.5px] leading-relaxed text-warn">
              Transfer leg — changes here affect only this account&apos;s side (sent and
              received amounts can differ; the gap is the bank&apos;s fee).
            </p>
          )}
          {err && <p className="num text-[10.5px] text-neg">{err}</p>}
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <button
            onClick={save}
            disabled={update.isPending}
            className={cn(
              "flex-1 rounded-xl bg-ink py-3 text-[11.5px] font-bold tracking-[1.5px] text-surface",
              "disabled:opacity-50",
            )}
          >
            SAVE
          </button>
          <ConfirmButton
            label="Delete"
            confirmLabel={isTransfer ? "Delete both legs?" : "Really delete?"}
            onConfirm={remove}
            disabled={del.isPending}
            className="rounded-xl border border-neg/40 px-4 py-3 text-[12px] font-bold text-neg/90 disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
