"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format-money";
import { masked, usePrivacy } from "@/shell/privacy";
import {
  useAccounts,
  useCreateAccount,
  useCurrencies,
  useDeleteAccount,
  useReconcileAccount,
  useUpdateAccount,
} from "../api/hooks";
import type { AccountDto } from "../types";
import { Icon } from "./Icon";

const SUBTYPES = [
  { value: "bank", label: "Bank account", kind: "transactional", icon: "bank" },
  { value: "cash", label: "Cash wallet", kind: "transactional", icon: "wallet" },
  { value: "credit_card", label: "Credit card", kind: "transactional", icon: "credit_card" },
  { value: "loan", label: "Loan", kind: "transactional", icon: "loan" },
  { value: "crypto", label: "Crypto", kind: "priced", icon: "crypto" },
  { value: "stock", label: "Stock", kind: "priced", icon: "stock" },
  { value: "other", label: "Other asset", kind: "transactional", icon: "other" },
] as const;

export function AccountsPage() {
  const { data: accounts } = useAccounts();
  const { data: currencyData } = useCurrencies();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <h1 className="text-sm font-semibold tracking-[2px] text-muted">ACCOUNTS</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-[11px] bg-ink px-4 py-2 text-[12px] font-bold tracking-wide text-surface hover:bg-white"
        >
          {showForm ? "CLOSE" : "+ ADD ACCOUNT"}
        </button>
      </div>

      {showForm && <AccountForm onDone={() => setShowForm(false)} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(accounts ?? []).map((a) => (
          <AccountRow key={a.id} account={a} defaultCurrency={currencyData?.defaultCurrency ?? "KWD"} />
        ))}
      </div>

      <ArchivedAccounts />
    </div>
  );
}

function ArchivedAccounts() {
  const { data: archived } = useQuery({
    queryKey: ["accounts", "archived"],
    queryFn: async (): Promise<AccountDto[]> => {
      const res = await fetch("/api/finance/accounts?archived=1");
      if (!res.ok) throw new Error("Failed to load archived accounts");
      return res.json();
    },
    staleTime: 60_000,
  });
  const update = useUpdateAccount();
  if (!archived || archived.length === 0) return null;

  return (
    <Card title="ARCHIVED">
      <div className="flex flex-col gap-0.5">
        {archived.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2.5 rounded-[9px] px-1.5 py-2 hover:bg-card-hover"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-inset text-ghost">
              <Icon name={a.icon} size={13} />
            </span>
            <span className="flex-1 truncate text-[12.5px] text-faint">
              {a.name}
              <span className="num ml-2 text-[9.5px]">
                {a.subtype.replace("_", " ")} · {a.currencyCode}
              </span>
            </span>
            <button
              onClick={() => update.mutate({ id: a.id, archived: false })}
              className="p-1.5 text-[10px] font-bold tracking-[1px] text-faint hover:text-pos"
            >
              RESTORE
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AccountRow({
  account: a,
  defaultCurrency,
}: {
  account: AccountDto;
  defaultCurrency: string;
}) {
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  const reconcile = useReconcileAccount();
  const { privacy } = usePrivacy();
  const [editing, setEditing] = useState(false);
  const [editingQty, setEditingQty] = useState(false);
  const [qty, setQty] = useState(a.quantity ?? "0");
  const [reconciling, setReconciling] = useState(false);
  const [actual, setActual] = useState("");
  const [reconcileErr, setReconcileErr] = useState<string | null>(null);

  return (
    <Card className={cn(a.isLiability && "border-neg/25 bg-neg/5")}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-inset text-muted">
          <Icon name={a.icon} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink-2">
            {a.name}
            {a.mask && <span className="num ml-1.5 text-[10px] text-faint">{a.mask}</span>}
          </p>
          <p className="num mt-0.5 text-[10.5px] text-faint">
            {a.subtype.replace("_", " ")} · {a.currencyCode}
            {a.kind === "priced" && a.assetSymbol && ` · ${a.assetSymbol}`}
          </p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded p-1 text-ghost hover:text-muted"
          aria-label="Edit account"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.8 3.7a2.2 2.2 0 0 1 3.1 3.1L7.5 19.2 3 20.5l1.3-4.5z" />
          </svg>
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete/archive "${a.name}"?`)) del.mutate(a.id);
          }}
          className="rounded p-1 text-ghost hover:text-neg"
          aria-label="Delete account"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 7h16 M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2 M6.5 7l1 13h9l1-13" />
          </svg>
        </button>
      </div>

      {editing && <AccountEditForm account={a} onDone={() => setEditing(false)} />}

      <p
        className={cn(
          "num mt-3 text-lg font-semibold",
          (a.balance?.balanceMinor ?? 0) < 0 ? "text-neg" : "text-ink",
        )}
      >
        {a.balance ? masked(privacy, fmt(a.balance.balanceMinor, a.currency)) : "—"}{" "}
        <span className="text-xs font-medium text-faint">{a.currencyCode}</span>
        {a.balance?.priceStatus === "missing" ? (
          <span className="ml-2 text-[10px] font-bold text-neg">NO PRICE — check symbol</span>
        ) : (
          a.balance?.stale && <span className="ml-2 text-[10px] text-warn">stale</span>
        )}
      </p>
      {a.balance && a.currencyCode !== defaultCurrency && (
        <p className="num mt-0.5 text-[10.5px] text-faint">
          ≈ {masked(privacy, fmt(a.balance.balanceDefaultMinor, { exponent: 3 }))} {defaultCurrency}
        </p>
      )}

      {a.kind === "priced" && (
        <div className="num mt-2 flex items-center gap-2 text-[10.5px] text-faint">
          {editingQty ? (
            <>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                className="w-28 rounded border border-border-3 bg-surface px-2 py-1 text-right outline-none"
              />
              <button
                onClick={async () => {
                  await update.mutateAsync({ id: a.id, quantity: qty });
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
              <button onClick={() => setEditingQty(true)} className="text-muted underline">
                edit
              </button>
            </>
          )}
        </div>
      )}

      {a.kind === "transactional" && (
        <div className="num mt-2 text-[10.5px] text-faint">
          {reconciling ? (
            <span className="flex items-center gap-2">
              <input
                autoFocus
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Escape") setReconciling(false);
                  if (e.key === "Enter" && actual) {
                    setReconcileErr(null);
                    try {
                      await reconcile.mutateAsync({ id: a.id, actualBalance: actual });
                      setReconciling(false);
                      setActual("");
                    } catch (err) {
                      setReconcileErr(err instanceof Error ? err.message : "Failed");
                    }
                  }
                }}
                inputMode="decimal"
                placeholder={`actual balance (${a.currencyCode})`}
                className="w-40 rounded border border-border-3 bg-surface px-2 py-1 text-right text-ink outline-none"
              />
              <button
                onClick={() => setReconciling(false)}
                className="text-muted hover:text-ink"
              >
                cancel
              </button>
              {reconcileErr && <span className="text-neg">{reconcileErr}</span>}
            </span>
          ) : (
            <button
              onClick={() => setReconciling(true)}
              className="text-muted underline underline-offset-2 hover:text-ink"
              title="Enter what the bank actually says; a balance correction records the difference"
            >
              fix balance
            </button>
          )}
        </div>
      )}

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={a.includeInNetWorth}
          onChange={(e) => update.mutate({ id: a.id, includeInNetWorth: e.target.checked })}
          className="accent-[#35D07F]"
        />
        Count in net worth
      </label>
    </Card>
  );
}

function AccountEditForm({ account: a, onDone }: { account: AccountDto; onDone: () => void }) {
  const update = useUpdateAccount();
  const isPriced = a.kind === "priced";
  const [name, setName] = useState(a.name);
  const [mask, setMask] = useState(a.mask?.replace("•••• ", "") ?? "");
  const [assetSymbol, setAssetSymbol] = useState(a.assetSymbol ?? "");
  const [manualPrice, setManualPrice] = useState(
    a.manualPriceMinor !== null
      ? (a.manualPriceMinor / 10 ** a.currency.exponent).toFixed(a.currency.exponent)
      : "",
  );
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    try {
      await update.mutateAsync({
        id: a.id,
        name,
        mask: mask ? `•••• ${mask}` : undefined,
        assetSymbol: isPriced && assetSymbol ? assetSymbol : undefined,
        manualPrice: isPriced && manualPrice ? manualPrice : undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border-3 bg-card-hover p-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs text-ink outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-faint">
          Last 4
          <input
            value={mask}
            onChange={(e) => setMask(e.target.value)}
            maxLength={4}
            placeholder="4471"
            className="num w-16 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs text-ink outline-none"
          />
        </label>
        {isPriced && a.subtype !== "crypto" && (
          <label className="flex items-center gap-1.5 text-[10px] text-faint">
            Ticker
            <input
              value={assetSymbol}
              onChange={(e) => setAssetSymbol(e.target.value)}
              className="w-20 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-xs text-ink outline-none"
            />
          </label>
        )}
        {isPriced && (
          <label className="flex items-center gap-1.5 text-[10px] text-faint">
            Manual price ({a.currencyCode})
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              className="num w-24 rounded-lg border border-border-3 bg-surface px-2 py-1.5 text-right text-xs text-ink outline-none"
            />
          </label>
        )}
      </div>
      {isPriced && a.subtype === "crypto" && (
        <CryptoSymbolSearch value={assetSymbol} onSelect={setAssetSymbol} />
      )}
      {err && <p className="num text-[10.5px] text-neg">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={update.isPending || !name}
          className="rounded-lg bg-ink px-3 py-1.5 text-[10.5px] font-bold tracking-wide text-surface disabled:opacity-60"
        >
          SAVE
        </button>
        <button onClick={onDone} className="px-1.5 text-[10.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CryptoSymbolSearch({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; symbol: string; rank: number | null }[]
  >([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/finance/crypto-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.coins ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <label className="relative flex flex-col gap-1.5 text-[11px] text-muted">
      Coin {value && <span className="text-pos">✓ {value}</span>}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or ticker (e.g. HBAR)…"
        className="rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
      />
      {(results.length > 0 || searching) && (
        <div className="absolute top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-border-4 bg-card shadow-2xl">
          {searching && <p className="px-3 py-2 text-[11px] text-faint">Searching…</p>}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c.id);
                setQuery("");
                setResults([]);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-2 hover:bg-card-hover"
            >
              <span className="num font-bold uppercase text-muted">{c.symbol}</span>
              {c.name}
              {c.rank && <span className="num ml-auto text-[10px] text-faint">#{c.rank}</span>}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const { data: currencyData } = useCurrencies();
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState<(typeof SUBTYPES)[number]>(SUBTYPES[0]);
  const [currencyCode, setCurrencyCode] = useState("KWD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [mask, setMask] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const isPriced = subtype.kind === "priced";
  const isLiability = subtype.value === "credit_card" || subtype.value === "loan";

  async function submit() {
    setErr(null);
    try {
      await create.mutateAsync({
        name,
        kind: subtype.kind,
        subtype: subtype.value,
        currencyCode,
        isLiability,
        includeInNetWorth: true,
        openingBalance: !isPriced && openingBalance ? openingBalance : undefined,
        assetSymbol: isPriced && assetSymbol ? assetSymbol : undefined,
        quantity: isPriced && quantity ? quantity : undefined,
        priceSource: isPriced ? (manualPrice ? "manual" : subtype.value === "crypto" ? "coingecko" : "finnhub") : undefined,
        manualPrice: isPriced && manualPrice ? manualPrice : undefined,
        icon: subtype.icon,
        mask: mask ? `•••• ${mask}` : undefined,
        sortOrder: 0,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create account");
    }
  }

  return (
    <Card title="NEW ACCOUNT">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[11px] text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gulf Bank Salary"
            className="rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[11px] text-muted">
          Type
          <select
            value={subtype.value}
            onChange={(e) => setSubtype(SUBTYPES.find((s) => s.value === e.target.value)!)}
            className="rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
          >
            {SUBTYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[11px] text-muted">
          Currency
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            className="rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
          >
            {(currencyData?.currencies ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        {!isPriced ? (
          <label className="flex flex-col gap-1.5 text-[11px] text-muted">
            Opening balance {isLiability && "(amount owed)"}
            <input
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              inputMode="decimal"
              placeholder="0.000"
              className="num rounded-lg border border-border-3 bg-surface px-3 py-2 text-right text-[13px] text-ink outline-none"
            />
          </label>
        ) : (
          <>
            {subtype.value === "crypto" ? (
              <CryptoSymbolSearch value={assetSymbol} onSelect={setAssetSymbol} />
            ) : (
              <label className="flex flex-col gap-1.5 text-[11px] text-muted">
                Ticker (e.g. AAPL)
                <input
                  value={assetSymbol}
                  onChange={(e) => setAssetSymbol(e.target.value)}
                  className="rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-[11px] text-muted">
              Quantity
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                placeholder="0.05"
                className="num rounded-lg border border-border-3 bg-surface px-3 py-2 text-right text-[13px] text-ink outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] text-muted">
              Manual price per unit (optional, in account currency)
              <input
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                inputMode="decimal"
                className="num rounded-lg border border-border-3 bg-surface px-3 py-2 text-right text-[13px] text-ink outline-none"
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1.5 text-[11px] text-muted">
          Last 4 digits (optional)
          <input
            value={mask}
            onChange={(e) => setMask(e.target.value)}
            maxLength={4}
            placeholder="4471"
            className="num rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
          />
        </label>
      </div>
      {err && <p className="num mt-2 text-[11px] text-neg">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={submit}
          disabled={create.isPending || !name}
          className="rounded-[11px] bg-ink px-5 py-2.5 text-[12px] font-bold tracking-wide text-surface hover:bg-white disabled:opacity-60"
        >
          {create.isPending ? "…" : "CREATE"}
        </button>
        <button onClick={onDone} className="px-3 text-[12px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </Card>
  );
}
