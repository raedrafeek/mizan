"use client";

import Decimal from "decimal.js";
import { useAccounts, useCurrencies } from "../api/hooks";

/** Quiet rates line for the foreign currencies your accounts actually use. */
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
    <p className="num text-[12px] text-muted">
      {shown.map(([code, r], i) => (
        <span key={code}>
          {i > 0 && <span className="text-faint"> · </span>}
          1 {code} ≈{" "}
          <span className="text-ink-2">
            {new Decimal(r.rate).toSignificantDigits(4).toString()}
          </span>{" "}
          {def}
          {r.stale && <span className="text-warn"> (old rate)</span>}
        </span>
      ))}
    </p>
  );
}
