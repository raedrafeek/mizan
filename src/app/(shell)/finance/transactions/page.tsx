"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/shell/Card";
import { TransactionList } from "@/modules/finance/components/TransactionList";
import { useAccounts, useCategories } from "@/modules/finance/api/hooks";

function TransactionsPageInner() {
  const sp = useSearchParams();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const [accountId, setAccountId] = useState(sp.get("accountId") ?? "");
  const [categoryId, setCategoryId] = useState(sp.get("categoryId") ?? "");
  const [month, setMonth] = useState(sp.get("month") ?? "");
  const [q, setQ] = useState("");

  const filters = {
    accountId: accountId || undefined,
    categoryId: categoryId || undefined,
    month: month || undefined,
    q: q || undefined,
  };
  const active = accountId || categoryId || month || q;

  return (
    <Card title="TRANSACTIONS">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-lg border border-border-3 bg-surface px-2.5 py-2 text-xs text-ink outline-none"
        >
          <option value="">All accounts</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-border-3 bg-surface px-2.5 py-2 text-xs text-ink outline-none"
        >
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="num rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs text-ink outline-none"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes…"
          className="min-w-36 flex-1 rounded-lg border border-border-3 bg-surface px-3 py-2 text-xs text-ink outline-none sm:max-w-56"
        />
        {active && (
          <button
            onClick={() => {
              setAccountId("");
              setCategoryId("");
              setMonth("");
              setQ("");
            }}
            className="px-2 py-1.5 text-[11px] text-muted hover:text-ink"
          >
            clear
          </button>
        )}
      </div>
      <TransactionList filters={filters} />
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TransactionsPageInner />
    </Suspense>
  );
}
