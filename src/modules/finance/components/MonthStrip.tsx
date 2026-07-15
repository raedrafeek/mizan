"use client";

import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { todayISO } from "@/lib/format-money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useCurrencies } from "../api/hooks";
import { useCashFlow } from "../api/hooks-m2";

/** The three-number month pulse under the hero: IN / OUT / SAVED. */
export function MonthStrip() {
  const month = todayISO().slice(0, 7);
  const { data } = useCashFlow(month);
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();

  if (!data) return null;
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const cf = data.cashflow;

  const cell = (label: string, value: React.ReactNode) => (
    <div className="flex-1 text-center">
      <p className="num text-[15px] font-semibold">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold tracking-[1.5px] text-muted">{label}</p>
    </div>
  );

  return (
    // full-bleed band on phones (matches the concept); content-width on desktop
    <div className="-mx-4 flex divide-x divide-border border-y border-border py-2.5 md:mx-0">
      {cell(
        "IN",
        <span className="text-pos">
          +{masked(privacy, formatMinor(cf.incomeDefaultMinor, exponent))}
        </span>,
      )}
      {cell(
        "OUT",
        <span className="text-ink">
          −{masked(privacy, formatMinor(cf.expenseDefaultMinor, exponent))}
        </span>,
      )}
      {cell(
        "SAVED",
        <span
          className={cn(
            cf.savingsRatePct !== null && cf.savingsRatePct < 0 ? "text-neg" : "text-ink",
          )}
        >
          {cf.savingsRatePct === null ? "—" : `${cf.savingsRatePct}%`}
        </span>,
      )}
    </div>
  );
}
