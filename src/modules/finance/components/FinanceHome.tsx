"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/shell/Card";
import Link from "next/link";
import { useAccounts, useCurrencies } from "../api/hooks";
import { AccountsStrip } from "./AccountsStrip";
import { QuickLog } from "./QuickLog";
import { TransactionList } from "./TransactionList";
import { NetPositionHero } from "./NetPositionHero";
import { CashFlowCard } from "./CashFlowCard";
import { TopCategoriesCard } from "./TopCategoriesCard";
import { CampaignsCard } from "./CampaignsCard";
import { HorizonCard } from "./HorizonCard";

const SELECTED_KEY = "mizan.spendFrom";

export function FinanceHome() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: currencyData } = useCurrencies();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // restore last "spend from" account
  useEffect(() => {
    const saved = localStorage.getItem(SELECTED_KEY);
    if (saved) setSelectedId(saved);
  }, []);

  const selected = useMemo(() => {
    const list = (accounts ?? []).filter((a) => a.kind === "transactional");
    return list.find((a) => a.id === selectedId) ?? list[0] ?? null;
  }, [accounts, selectedId]);

  function select(id: string) {
    setSelectedId(id);
    localStorage.setItem(SELECTED_KEY, id);
  }

  const defExponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-faint">Loading…</p>;
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">No accounts yet.</p>
        <Link
          href="/finance/accounts"
          className="mt-3 inline-block rounded-[11px] bg-ink px-5 py-2.5 text-[12.5px] font-bold tracking-wide text-surface"
        >
          ADD YOUR FIRST ACCOUNT
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <NetPositionHero />
      <AccountsStrip
        accounts={accounts}
        defaultCurrency={currencyData?.defaultCurrency ?? "KWD"}
        defaultExponent={defExponent}
        selectedId={selected?.id ?? null}
        onSelect={select}
      />
      <QuickLog account={selected} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          title="RECENT TRANSACTIONS"
          right={
            <Link href="/finance/transactions" className="text-[11.5px] text-muted hover:text-ink">
              View all →
            </Link>
          }
        >
          <TransactionList limit={6} />
        </Card>
        <CashFlowCard />
        <TopCategoriesCard />
        <HorizonCard />
        <CampaignsCard />
      </div>
    </div>
  );
}
