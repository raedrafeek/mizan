"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format-money";
import { masked, usePrivacy } from "@/shell/privacy";
import type { AccountDto } from "../types";
import { Icon } from "./Icon";

export function AccountsStrip({
  accounts,
  defaultCurrency,
  defaultExponent,
  selectedId,
  onSelect,
}: {
  accounts: AccountDto[];
  defaultCurrency: string;
  defaultExponent: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { privacy } = usePrivacy();
  return (
    <div className="relative">
      <div className="hs flex gap-3.5 overflow-x-auto px-1 py-1">
        {accounts.map((a) => {
          const selectable = a.kind === "transactional";
          const selected = selectedId === a.id;
          const bal = a.balance;
          const negative = (bal?.balanceMinor ?? 0) < 0;
          return (
            <button
              key={a.id}
              onClick={() => selectable && onSelect(a.id)}
              className={cn(
                "relative w-[212px] flex-none rounded-2xl border p-4 text-left",
                selected
                  ? "border-ink/50 bg-card-hover"
                  : a.isLiability
                    ? "border-neg/25 bg-neg/5"
                    : "border-border-2 bg-card",
                !selectable && "cursor-default opacity-70",
              )}
            >
              {selected && (
                <span className="absolute right-3 top-3 rounded-[5px] bg-ink px-1.5 py-[3px] text-[8.5px] font-bold tracking-[1.5px] text-surface">
                  SPEND FROM
                </span>
              )}
              <span className="flex items-center gap-2 text-muted">
                <Icon name={a.icon} size={15} />
                <span className="truncate text-xs font-semibold text-ink-2">{a.name}</span>
              </span>
              <span className="num mt-1.5 block h-[13px] text-[10.5px] text-faint">
                {a.mask ?? (a.kind === "priced" ? a.assetSymbol?.toUpperCase() : "")}
              </span>
              <span
                className={cn(
                  "num mt-2.5 block text-[19px] font-semibold",
                  negative ? "text-neg" : "text-ink",
                )}
              >
                {bal ? masked(privacy, fmt(bal.balanceMinor, a.currency)) : "—"}
              </span>
              <span className="num mt-1 block h-[13px] text-[10.5px] text-faint">
                {a.currencyCode}
                {bal && a.currencyCode !== defaultCurrency && (
                  <>
                    {" "}
                    · ≈ {masked(privacy, fmt(bal.balanceDefaultMinor, { exponent: defaultExponent }))}{" "}
                    {defaultCurrency}
                  </>
                )}
                {bal?.priceStatus === "missing" ? (
                  <span className="font-bold text-neg"> · NO PRICE — check symbol</span>
                ) : (
                  bal?.stale && <span className="text-warn"> · stale</span>
                )}
                {!a.includeInNetWorth && " · not counted"}
              </span>
            </button>
          );
        })}
        <Link
          href="/finance/accounts"
          className="flex w-16 flex-none items-center justify-center rounded-2xl border border-dashed border-border-5 text-faint hover:border-ghost hover:text-muted"
          aria-label="Manage accounts"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 5v14 M5 12h14" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
