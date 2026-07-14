"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/shell/Skeleton";
import { fmt } from "@/lib/format-money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useAccounts } from "../api/hooks";
import { Icon } from "./Icon";
import { QuickLog } from "./QuickLog";
import { TransactionList } from "./TransactionList";

const SELECTED_KEY = "mizan.spendFrom";

/** Phone-first quick-log: account chips → big quick-log → last few entries. */
export function LogScreen() {
  const { data: accounts, isLoading } = useAccounts();
  const { privacy } = usePrivacy();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(SELECTED_KEY);
    if (saved) setSelectedId(saved);
  }, []);

  const transactional = useMemo(
    () => (accounts ?? []).filter((a) => a.kind === "transactional"),
    [accounts],
  );
  const selected =
    transactional.find((a) => a.id === selectedId) ?? transactional[0] ?? null;

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-32 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[62px] rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (transactional.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        No accounts yet —{" "}
        <Link href="/finance/accounts" className="text-ink underline">
          add one first
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="hs flex gap-2 overflow-x-auto p-0.5">
        {transactional.map((a) => {
          const sel = selected?.id === a.id;
          return (
            <button
              key={a.id}
              onClick={() => {
                setSelectedId(a.id);
                localStorage.setItem(SELECTED_KEY, a.id);
              }}
              className={cn(
                "flex flex-none items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold",
                sel ? "border-ink bg-ink text-surface" : "border-border-4 text-muted",
              )}
            >
              <Icon name={a.icon} size={13} />
              {a.name}
              {a.balance && (
                <span className={cn("num text-[10px]", sel ? "text-surface/70" : "text-faint")}>
                  {masked(privacy, fmt(a.balance.balanceMinor, a.currency))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <QuickLog account={selected} />

      <div className="rounded-2xl border border-border-2 bg-card p-4">
        <p className="mb-2 text-[10.5px] font-semibold tracking-[2px] text-muted">JUST LOGGED</p>
        <TransactionList limit={4} />
      </div>

      <Link href="/" className="text-center text-[11.5px] text-faint hover:text-ink">
        ← Full dashboard
      </Link>
    </div>
  );
}
