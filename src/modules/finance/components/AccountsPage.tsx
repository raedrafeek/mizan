"use client";

import { useState } from "react";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format-money";
import {
  useAccounts,
  useCreateAccount,
  useCurrencies,
  useDeleteAccount,
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
    </div>
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
  const [editingQty, setEditingQty] = useState(false);
  const [qty, setQty] = useState(a.quantity ?? "0");

  return (
    <Card className={cn(a.isLiability && "border-neg/25 bg-neg/5")}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-inset text-muted">
          <Icon name={a.icon} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink-2">{a.name}</p>
          <p className="num mt-0.5 text-[10.5px] text-faint">
            {a.subtype.replace("_", " ")} · {a.currencyCode}
            {a.kind === "priced" && a.assetSymbol && ` · ${a.assetSymbol}`}
          </p>
        </div>
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

      <p
        className={cn(
          "num mt-3 text-lg font-semibold",
          (a.balance?.balanceMinor ?? 0) < 0 ? "text-neg" : "text-ink",
        )}
      >
        {a.balance ? fmt(a.balance.balanceMinor, a.currency) : "—"}{" "}
        <span className="text-xs font-medium text-faint">{a.currencyCode}</span>
        {a.balance?.stale && <span className="ml-2 text-[10px] text-warn">stale</span>}
      </p>
      {a.balance && a.currencyCode !== defaultCurrency && (
        <p className="num mt-0.5 text-[10.5px] text-faint">
          ≈ {fmt(a.balance.balanceDefaultMinor, { exponent: 3 })} {defaultCurrency}
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
            <label className="flex flex-col gap-1.5 text-[11px] text-muted">
              Asset symbol ({subtype.value === "crypto" ? "CoinGecko id, e.g. bitcoin" : "ticker, e.g. AAPL"})
              <input
                value={assetSymbol}
                onChange={(e) => setAssetSymbol(e.target.value)}
                className="rounded-lg border border-border-3 bg-surface px-3 py-2 text-[13px] text-ink outline-none"
              />
            </label>
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
