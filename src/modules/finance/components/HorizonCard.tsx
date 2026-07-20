"use client";

import { useState } from "react";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { ConfirmButton } from "@/shell/ConfirmButton";
import { masked, usePrivacy } from "@/shell/privacy";
import { useAccounts, useCategories, useCurrencies } from "../api/hooks";
import {
  useCreateHorizonItem,
  useDeleteHorizonItem,
  useHorizon,
  useLogHorizonItem,
  useUpdateHorizonItem,
  type HorizonItemDto,
} from "../api/hooks-m3";

export function HorizonCard() {
  const { data: items } = useHorizon();
  const [adding, setAdding] = useState(false);

  return (
    <Card
      title="UPCOMING"
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
  const { privacy } = usePrivacy();
  const [open, setOpen] = useState(false);
  const exponent =
    currencyData?.currencies.find((c) => c.code === h.currencyCode)?.exponent ?? 2;
  const out = h.direction === "outflow";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[9px] px-1.5 py-2.5 text-left hover:bg-card-hover"
      >
        <span
          className={cn(
            "flex h-8 w-8 flex-none items-center justify-center rounded-lg",
            h.warn ? "bg-warn/10 text-warn" : "bg-inset text-muted",
          )}
        >
          {h.warn ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4.5 M12 17h.01" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5.5h16v15H4z M8 3v4 M16 3v4 M4 10h16" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink-2">
            {h.name}
          </span>
          <span className={cn("num mt-0.5 block text-[11.5px]", h.warn ? "text-warn" : "text-muted")}>
            {h.daysUntil < 0
              ? `${-h.daysUntil}d overdue`
              : h.daysUntil === 0
                ? "due today"
                : `in ${h.daysUntil} days`}
            {h.recurrence ? ` · ${h.recurrence}` : ""}
            {h.autoPost ? " · auto" : ""}
          </span>
        </span>
        <span
          className={cn(
            "num flex-none text-[14px]",
            h.direction === "inflow" ? "text-pos" : "text-ink",
          )}
        >
          {h.direction === "transfer" ? "⇄ " : out ? "−" : "+"}
          {masked(privacy, formatMinor(h.amountMinor, exponent))} {h.currencyCode}
        </span>
      </button>
      {open && <UpcomingSheet item={h} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Tap-through upcoming-item detail: log it, edit, delete — full-size actions. */
function UpcomingSheet({ item: h, onClose }: { item: HorizonItemDto; onClose: () => void }) {
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const log = useLogHorizonItem();
  const del = useDeleteHorizonItem();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const exponent =
    currencyData?.currencies.find((c) => c.code === h.currencyCode)?.exponent ?? 2;
  const out = h.direction === "outflow";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border-4 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl">
        <div className="mb-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-2">{h.name}</p>
          <button
            onClick={onClose}
            className="flex-none px-1 text-[18px] leading-none text-faint hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="num text-[12px] text-muted">
          <span className={cn(h.direction === "inflow" ? "text-pos" : "text-ink")}>
            {h.direction === "transfer" ? "⇄ " : out ? "−" : "+"}
            {masked(privacy, formatMinor(h.amountMinor, exponent))} {h.currencyCode}
          </span>{" "}
          · due {h.dueDate}
          {h.recurrence ? ` · repeats ${h.recurrence}` : ""}
          {h.autoPost ? " · posts automatically" : ""}
          <span className={cn(h.warn ? "text-warn" : "")}>
            {" "}
            ({h.daysUntil < 0 ? `${-h.daysUntil}d overdue` : `in ${h.daysUntil} days`})
          </span>
        </p>

        {editing ? (
          <div className="mt-3">
            <HorizonForm item={h} onDone={() => setEditing(false)} />
          </div>
        ) : (
          <button
            onClick={async () => {
              setErr(null);
              try {
                await log.mutateAsync(h.id);
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed");
              }
            }}
            disabled={log.isPending || !h.accountId}
            className="mt-4 w-full rounded-xl bg-ink py-3 text-[12px] font-bold tracking-[1.5px] text-surface disabled:opacity-40"
          >
            {h.accountId ? "LOG IT NOW" : "SET AN ACCOUNT FIRST (EDIT)"}
          </button>
        )}
        {err && <p className="num mt-2 text-[11px] text-neg">{err}</p>}

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-border-4 px-4 py-2 text-[11px] font-bold tracking-[0.5px] text-muted hover:text-ink"
          >
            {editing ? "Close edit" : "Edit"}
          </button>
          <ConfirmButton
            label="Delete"
            onConfirm={() => {
              del.mutate(h.id);
              onClose();
            }}
            className="ml-auto rounded-full border border-neg/35 px-4 py-2 text-[11px] font-bold tracking-[0.5px] text-neg/80 hover:text-neg"
          />
        </div>
      </div>
    </div>
  );
}

function HorizonForm({ item, onDone }: { item?: HorizonItemDto; onDone: () => void }) {
  const create = useCreateHorizonItem();
  const update = useUpdateHorizonItem();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: currencyData } = useCurrencies();
  const itemExponent =
    currencyData?.currencies.find((c) => c.code === item?.currencyCode)?.exponent ?? 3;
  const [name, setName] = useState(item?.name ?? "");
  const [direction, setDirection] = useState<"outflow" | "inflow" | "transfer">(
    item?.direction ?? "outflow",
  );
  const [amount, setAmount] = useState(
    item ? (item.amountMinor / 10 ** itemExponent).toFixed(itemExponent) : "",
  );
  const [currencyCode, setCurrencyCode] = useState(item?.currencyCode ?? "KWD");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [recurrence, setRecurrence] = useState(item?.recurrence ?? "");
  const [accountId, setAccountId] = useState(item?.accountId ?? "");
  const [counterAccountId, setCounterAccountId] = useState(item?.counterAccountId ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [autoPost, setAutoPost] = useState(item?.autoPost ?? false);
  const [err, setErr] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const isTransfer = direction === "transfer";

  const cats = (categories ?? []).filter(
    (c) => c.type === (direction === "inflow" ? "income" : "expense"),
  );

  async function submit() {
    setErr(null);
    try {
      if (item) {
        await update.mutateAsync({
          id: item.id,
          name,
          direction,
          amount,
          currencyCode,
          dueDate,
          recurrence: (recurrence || null) as "monthly" | "yearly" | null,
          accountId: accountId || undefined,
          counterAccountId: isTransfer ? counterAccountId || undefined : null,
          categoryId: isTransfer ? undefined : categoryId || undefined,
          autoPost,
        });
      } else {
        await create.mutateAsync({
          name,
          direction,
          amount,
          currencyCode,
          dueDate,
          recurrence: (recurrence || undefined) as "monthly" | "yearly" | undefined,
          accountId: accountId || undefined,
          counterAccountId: isTransfer ? counterAccountId || undefined : undefined,
          categoryId: isTransfer ? undefined : categoryId || undefined,
          alertDaysBefore: 7,
          autoPost,
        });
      }
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
          onChange={(e) => setDirection(e.target.value as "outflow" | "inflow" | "transfer")}
          className="rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          <option value="outflow">− Payment</option>
          <option value="inflow">+ Income</option>
          <option value="transfer">⇄ Transfer (card bill, savings…)</option>
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. School fees — Term 1)"
          className="flex-1 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-2">
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
      <div className="flex flex-wrap gap-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="min-w-32 flex-1 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
        >
          <option value="">{isTransfer ? "From account" : "Account for logging (optional)"}</option>
          {(accounts ?? [])
            .filter((a) => a.kind === "transactional")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        {isTransfer ? (
          <select
            value={counterAccountId}
            onChange={(e) => setCounterAccountId(e.target.value)}
            className="min-w-32 flex-1 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs outline-none"
          >
            <option value="">→ To account</option>
            {(accounts ?? [])
              .filter((a) => a.kind === "transactional" && a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  → {a.name}
                </option>
              ))}
          </select>
        ) : (
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
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={autoPost}
          onChange={(e) => setAutoPost(e.target.checked)}
          className="accent-pos"
        />
        Post automatically on the due date
      </label>
      {err && <p className="num text-[10.5px] text-neg">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pending || !name || !amount || !dueDate}
          className="rounded-lg bg-ink px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-surface disabled:opacity-60"
        >
          {item ? "SAVE" : "ADD"}
        </button>
        <button onClick={onDone} className="px-2 text-[11px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
