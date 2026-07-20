"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { TransactionList } from "@/modules/finance/components/TransactionList";
import { TrendsView } from "@/modules/finance/components/TrendsView";
import { useAccounts, useCategories } from "@/modules/finance/api/hooks";

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-none rounded-full border px-3.5 py-2 text-[12px] font-semibold",
        active
          ? "border-ink bg-ink text-surface"
          : "border-border-3 bg-card text-muted hover:text-ink",
      )}
    >
      {label} <span className={active ? "opacity-70" : "text-faint"}>▾</span>
    </button>
  );
}

/** Bottom-sheet option picker for the filter chips. */
function PickerSheet({
  title,
  options,
  selected,
  onSelect,
  onClose,
  children,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border-4 bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-3xl">
        <p className="mb-2 px-1 text-[10.5px] font-bold tracking-[2px] text-faint">{title}</p>
        {children}
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              onSelect(o.value);
              onClose();
            }}
            className={cn(
              "flex w-full items-center rounded-xl px-3 py-3 text-left text-[13.5px]",
              o.value === selected
                ? "bg-inset font-semibold text-ink"
                : "text-ink-2 hover:bg-card-hover",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityPageInner() {
  const sp = useSearchParams();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const [view, setView] = useState<"list" | "trends">("list");
  const [accountId, setAccountId] = useState(sp.get("accountId") ?? "");
  const [categoryId, setCategoryId] = useState(sp.get("categoryId") ?? "");
  const [month, setMonth] = useState(sp.get("month") ?? "");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<null | "account" | "category" | "month">(null);

  const filters = {
    accountId: accountId || undefined,
    categoryId: categoryId || undefined,
    month: month || undefined,
    q: q || undefined,
  };
  const active = accountId || categoryId || month || q;

  const accountLabel =
    (accounts ?? []).find((a) => a.id === accountId)?.name ?? "Account";
  const categoryLabel =
    (categories ?? []).find((c) => c.id === categoryId)?.name ?? "Category";
  const monthLabel = month
    ? new Date(month + "-01T00:00:00").toLocaleString("en", { month: "short", year: "2-digit" })
    : "Month";

  return (
    <div className="flex flex-col gap-3">
      {/* the past, two ways: the list of what happened, or the trends across months */}
      <div className="mx-auto flex gap-1 rounded-xl border border-border-3 bg-surface p-1">
        {(
          [
            ["list", "LIST"],
            ["trends", "TRENDS"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-lg px-5 py-1.5 text-[11px] font-bold tracking-[0.8px]",
              view === v ? "bg-inset-2 text-ink" : "text-faint",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "trends" && <TrendsView />}

      <div className={cn(view === "trends" && "hidden", "flex flex-col gap-3")}>
      <div className="flex items-center gap-2 rounded-2xl border border-border-2 bg-card px-4 py-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none text-faint">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes, places…"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none"
        />
        {q && (
          <button onClick={() => setQ("")} className="flex-none text-faint hover:text-ink">
            ×
          </button>
        )}
      </div>

      <div className="hs -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        <FilterChip label={accountLabel} active={!!accountId} onClick={() => setSheet("account")} />
        <FilterChip label={categoryLabel} active={!!categoryId} onClick={() => setSheet("category")} />
        <FilterChip label={monthLabel} active={!!month} onClick={() => setSheet("month")} />
        {active && (
          <button
            onClick={() => {
              setAccountId("");
              setCategoryId("");
              setMonth("");
              setQ("");
            }}
            className="flex-none px-2 text-[12px] text-muted hover:text-ink"
          >
            Clear
          </button>
        )}
        <span className="ml-auto hidden flex-none items-center md:flex">
          <Link href="/categories" className="text-[11.5px] text-muted hover:text-ink">
            Manage categories →
          </Link>
        </span>
      </div>

      <Card>
        <TransactionList filters={filters} />
      </Card>

      {sheet === "account" && (
        <PickerSheet
          title="ACCOUNT"
          options={[
            { value: "", label: "All accounts" },
            ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          selected={accountId}
          onSelect={setAccountId}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "category" && (
        <PickerSheet
          title="CATEGORY"
          options={[
            { value: "", label: "All categories" },
            ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
          selected={categoryId}
          onSelect={setCategoryId}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "month" && (
        <PickerSheet
          title="MONTH"
          options={[{ value: "", label: "All time" }]}
          selected={month}
          onSelect={setMonth}
          onClose={() => setSheet(null)}
        >
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              if (e.target.value) setSheet(null);
            }}
            className="num mb-2 w-full rounded-xl border border-border-3 bg-surface px-3 py-2.5 text-[13px] text-ink outline-none"
          />
        </PickerSheet>
      )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ActivityPageInner />
    </Suspense>
  );
}
