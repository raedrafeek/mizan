"use client";

import Decimal from "decimal.js";
import { useCurrencies } from "../api/hooks";

/** Nav FX ticker: shows DEFAULT/XXX for currencies used by accounts (top 2). */
export function FxTicker() {
  const { data } = useCurrencies();
  if (!data) return null;
  const def = data.defaultCurrency;
  const shown = Object.entries(data.rates)
    .filter(([code, r]) => code !== def && new Decimal(r.rate).gt(0))
    .slice(0, 2);
  if (shown.length === 0) return null;
  return (
    <div className="num flex gap-4 text-[11.5px] text-muted">
      {shown.map(([code, r]) => (
        <span key={code} className="flex items-center gap-1.5">
          <span
            className={`h-[5px] w-[5px] rounded-full ${r.stale ? "bg-warn" : "bg-pos"}`}
          />
          {def}/{code}{" "}
          <span className="text-ink">
            {new Decimal(1).div(r.rate).toSignificantDigits(4).toString()}
          </span>
        </span>
      ))}
    </div>
  );
}
