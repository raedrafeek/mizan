"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/shell/Card";
import { CardSkeleton, Skeleton } from "@/shell/Skeleton";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format-money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useToast } from "@/shell/toast";
import {
  useAccounts,
  useCurrencies,
  useDeleteAccount,
  useReconcileAccount,
  useUpdateAccount,
} from "../api/hooks";
import { AccountEditForm } from "./AccountsPage";
import { TransactionList } from "./TransactionList";
import { Icon } from "./Icon";

/** The account screen: balance, actions, and this account's own activity. */
export function AccountDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: accounts, isLoading } = useAccounts();
  const { data: currencyData } = useCurrencies();
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  const reconcile = useReconcileAccount();
  const toast = useToast();
  const { privacy } = usePrivacy();

  const [editing, setEditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [actual, setActual] = useState("");
  const [fixErr, setFixErr] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState(false);
  const [qty, setQty] = useState("");

  const a = accounts?.find((x) => x.id === id);
  const defaultCurrency = currencyData?.defaultCurrency ?? "KWD";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 rounded-2xl" />
        <CardSkeleton rows={6} />
      </div>
    );
  }
  if (!a) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        Account not found — it may be archived.{" "}
        <Link href="/accounts" className="text-ink underline">
          Back to accounts
        </Link>
      </p>
    );
  }

  async function fixBalance() {
    if (!actual) return;
    setFixErr(null);
    try {
      await reconcile.mutateAsync({ id, actualBalance: actual });
      setFixing(false);
      setActual("");
      toast.success("Balance corrected");
    } catch (err) {
      setFixErr(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/accounts" className="text-[11.5px] text-muted hover:text-ink">
        ← Accounts
      </Link>

      <Card className={cn(a.isLiability && "border-neg/25 bg-neg/5")}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-inset text-muted">
            <Icon name={a.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink-2">
              {a.name}
              {a.mask && <span className="num ml-2 text-[11px] text-faint">{a.mask}</span>}
            </p>
            <p className="num mt-0.5 text-[11px] text-faint">
              {a.subtype.replace("_", " ")} · {a.currencyCode}
              {a.kind === "priced" && a.assetSymbol && ` · ${a.assetSymbol}`}
            </p>
          </div>
        </div>

        <p
          className={cn(
            "num mt-4 text-3xl font-semibold tracking-tight",
            (a.balance?.balanceMinor ?? 0) < 0 ? "text-neg" : "text-ink",
          )}
        >
          {a.balance ? masked(privacy, fmt(a.balance.balanceMinor, a.currency)) : "—"}{" "}
          <span className="text-sm font-medium text-faint">{a.currencyCode}</span>
          {a.balance?.priceStatus === "missing" ? (
            <span className="ml-2 text-[11px] font-bold text-neg">NO PRICE — check symbol</span>
          ) : (
            a.balance?.stale && <span className="ml-2 text-[11px] text-warn">stale</span>
          )}
        </p>
        {a.balance && a.currencyCode !== defaultCurrency && (
          <p className="num mt-1 text-[11.5px] text-faint">
            ≈ {masked(privacy, fmt(a.balance.balanceDefaultMinor, { exponent: 3 }))}{" "}
            {defaultCurrency}
          </p>
        )}

        {a.kind === "priced" && (
          <div className="num mt-3 flex items-center gap-2 text-[11.5px] text-faint">
            {editingQty ? (
              <>
                <input
                  autoFocus
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  inputMode="decimal"
                  className="w-32 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-ink outline-none"
                />
                <button
                  onClick={async () => {
                    await update.mutateAsync({ id, quantity: qty });
                    setEditingQty(false);
                  }}
                  className="font-bold text-pos"
                >
                  SAVE
                </button>
                <button onClick={() => setEditingQty(false)} className="text-muted">
                  cancel
                </button>
              </>
            ) : (
              <>
                Qty: {a.quantity ?? "0"}
                <button
                  onClick={() => {
                    setQty(a.quantity ?? "0");
                    setEditingQty(true);
                  }}
                  className="text-muted underline"
                >
                  edit
                </button>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setEditing((v) => !v);
              setFixing(false);
            }}
            className="rounded-full border border-border-4 px-3.5 py-1.5 text-[10.5px] font-bold tracking-[1px] text-muted hover:text-ink"
          >
            EDIT
          </button>
          {a.kind === "transactional" && (
            <button
              onClick={() => {
                setFixing((v) => !v);
                setEditing(false);
              }}
              title="Enter what the bank actually says; a balance correction records the difference"
              className="rounded-full border border-border-4 px-3.5 py-1.5 text-[10.5px] font-bold tracking-[1px] text-muted hover:text-ink"
            >
              FIX BALANCE
            </button>
          )}
          <button
            onClick={() => {
              if (
                confirm(
                  `Archive "${a.name}"? Its history is kept and it can be restored from the Accounts page.`,
                )
              ) {
                del.mutate(id, {
                  onSuccess: () => {
                    toast.success(`Archived "${a.name}"`);
                    router.push("/accounts");
                  },
                });
              }
            }}
            className="rounded-full border border-neg/35 px-3.5 py-1.5 text-[10.5px] font-bold tracking-[1px] text-neg/80 hover:text-neg"
          >
            ARCHIVE
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={a.includeInNetWorth}
              onChange={(e) => update.mutate({ id, includeInNetWorth: e.target.checked })}
              className="accent-[#35D07F]"
            />
            Count in net worth
          </label>
        </div>

        {editing && <AccountEditForm account={a} onDone={() => setEditing(false)} />}
        {fixing && (
          <div className="num mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-3 bg-card-hover p-2.5 text-[11px]">
            <input
              autoFocus
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setFixing(false);
                if (e.key === "Enter") fixBalance();
              }}
              inputMode="decimal"
              placeholder={`actual balance (${a.currencyCode})`}
              className="w-44 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-ink outline-none"
            />
            <button onClick={fixBalance} disabled={reconcile.isPending || !actual} className="font-bold text-pos disabled:opacity-50">
              SAVE
            </button>
            <button onClick={() => setFixing(false)} className="text-muted">
              cancel
            </button>
            {fixErr && <span className="text-neg">{fixErr}</span>}
          </div>
        )}
      </Card>

      <Card title="ACTIVITY">
        <TransactionList accountId={id} />
      </Card>
    </div>
  );
}
