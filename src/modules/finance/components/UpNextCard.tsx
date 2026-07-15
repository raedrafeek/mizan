"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useToast } from "@/shell/toast";
import { useCurrencies } from "../api/hooks";
import { useHorizon, useLogHorizonItem } from "../api/hooks-m3";

/** Home's compact "what's due soon" — the nearest scheduled items with one-tap LOG IT. */
export function UpNextCard() {
  const { data: items } = useHorizon();
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const log = useLogHorizonItem();
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const next = (items ?? [])
    .filter((h) => h.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const exponentOf = (code: string) =>
    currencyData?.currencies.find((c) => c.code === code)?.exponent ?? 2;

  return (
    <Card
      title="UP NEXT"
      right={
        <Link href="/plan" className="text-[11.5px] text-muted hover:text-ink">
          All upcoming →
        </Link>
      }
    >
      {next.length === 0 ? (
        <p className="text-xs text-faint">
          Nothing due soon — add bills and planned money on the Plan tab.
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {next.map((h) => {
            const out = h.direction === "outflow";
            return (
              <div key={h.id} className="flex items-center gap-3 rounded-[9px] px-1.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink-2">
                    {h.name}
                  </span>
                  <span
                    className={cn(
                      "num mt-0.5 block text-[10px]",
                      h.warn ? "text-warn" : "text-faint",
                    )}
                  >
                    {h.daysUntil < 0
                      ? `${-h.daysUntil}d overdue`
                      : h.daysUntil === 0
                        ? "due today"
                        : `in ${h.daysUntil} days`}
                    {h.recurrence ? ` · ${h.recurrence}` : ""}
                  </span>
                </span>
                <span className={cn("num text-[12.5px]", out ? "text-neg" : "text-pos")}>
                  {out ? "−" : "+"}
                  {masked(privacy, formatMinor(h.amountMinor, exponentOf(h.currencyCode)))}{" "}
                  <span className="text-[10px] text-faint">{h.currencyCode}</span>
                </span>
                {h.accountId && (
                  <button
                    onClick={async () => {
                      setPendingId(h.id);
                      try {
                        await log.mutateAsync(h.id);
                        toast.success(`Logged — ${h.name}`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to log");
                      } finally {
                        setPendingId(null);
                      }
                    }}
                    disabled={pendingId === h.id}
                    className="flex-none rounded-full bg-ink px-3 py-1.5 text-[9.5px] font-bold tracking-[1px] text-surface disabled:opacity-50"
                  >
                    LOG IT
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
