"use client";

import Decimal from "decimal.js";
import { useAccounts, useCurrencies } from "../api/hooks";

/** Nav FX ticker: rates for the foreign currencies your accounts actually use. */
export function FxTicker() {
  const { data } = useCurrencies();
  const { data: accounts } = useAccounts();
  if (!data) return null;
  const def = data.defaultCurrency;

  const used = new Set(
    (accounts ?? [])
      .map((a) => a.currencyCode)
      .filter((code) => code !== def && data.rates[code]),
  );
  const shown = [...used]
    .map((code) => [code, data.rates[code]] as const)
    .filter(([, r]) => new Decimal(r.rate).gt(0))
    .slice(0, 3);
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
