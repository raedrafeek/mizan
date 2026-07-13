"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { useCurrencies } from "../api/hooks";
import { useNetWorth, useRefreshPrices } from "../api/hooks-m2";

function sparkPoints(values: number[], w = 260, h = 72, pad = 4): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function NetPositionHero() {
  const { data } = useNetWorth();
  const { data: currencyData } = useCurrencies();
  const refresh = useRefreshPrices();

  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const def = currencyData?.defaultCurrency ?? "KWD";

  const series = useMemo(() => {
    if (!data) return null;
    const nets = [...data.snapshots.map((s) => s.netDefaultMinor), data.current.netDefaultMinor];
    const liabs = [
      ...data.snapshots.map((s) => s.liabilitiesDefaultMinor),
      data.current.liabilitiesDefaultMinor,
    ];
    const first = nets[0];
    const delta = data.current.netDefaultMinor - first;
    const deltaPct = first !== 0 ? (delta / Math.abs(first)) * 100 : null;
    return { nets, liabs, first, delta, deltaPct, days: nets.length - 1 };
  }, [data]);

  if (!data) return null;
  const { current } = data;
  const up = (series?.delta ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-6 py-2 lg:flex-row lg:items-center lg:gap-14">
      <div>
        <p className="mb-2.5 flex items-center gap-3 text-[11px] font-semibold tracking-[2.5px] text-faint">
          NET POSITION
          {current.anyStale && <span className="text-warn normal-case tracking-normal">· some prices stale</span>}
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="rounded border border-border-3 px-1.5 py-0.5 text-[9px] tracking-[1px] text-muted hover:text-ink disabled:opacity-50"
          >
            {refresh.isPending ? "…" : "REFRESH"}
          </button>
        </p>
        <p className="num text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
          {formatMinor(current.netDefaultMinor, exponent)}{" "}
          <span className="text-lg font-medium text-faint sm:text-xl">{def}</span>
        </p>
        {series && series.days > 0 && (
          <p
            className={cn(
              "num mt-3 flex items-center gap-2 text-[13px]",
              up ? "text-pos" : "text-neg",
            )}
          >
            {up ? "+" : "−"}
            {formatMinor(Math.abs(series.delta), exponent)}
            {series.deltaPct !== null && (
              <> {up ? "▲" : "▼"} {Math.abs(series.deltaPct).toFixed(1)}%</>
            )}
            <span className="text-faint">({series.days}D)</span>
          </p>
        )}
      </div>

      <div className="hidden flex-1 lg:block" />

      <div className="flex min-w-[230px] flex-col gap-2.5 text-[13px]">
        <p className="flex justify-between gap-8">
          <span className="text-muted">Assets</span>
          <span className="num text-ink">{formatMinor(current.assetsDefaultMinor, exponent)}</span>
        </p>
        <p className="flex justify-between gap-8">
          <span className="text-muted">Liabilities</span>
          <span className="num text-neg">
            {current.liabilitiesDefaultMinor > 0 ? "−" : ""}
            {formatMinor(current.liabilitiesDefaultMinor, exponent)}
          </span>
        </p>
        <p className="flex justify-between gap-8 border-t border-border pt-2.5">
          <span className="font-semibold text-ink">Net</span>
          <span className={cn("num font-semibold", up ? "text-pos" : "text-ink")}>
            {formatMinor(current.netDefaultMinor, exponent)}
          </span>
        </p>
      </div>

      {series && series.days > 1 && (
        <div className="w-full max-w-[260px]">
          <svg width="260" height="72" viewBox="0 0 260 72" fill="none" className="max-w-full">
            <polyline
              points={sparkPoints(series.nets)}
              stroke="var(--color-pos)"
              strokeWidth="1.5"
              fill="none"
              strokeLinejoin="round"
            />
            <polyline
              points={sparkPoints(series.liabs)}
              stroke="var(--color-neg)"
              strokeWidth="1.2"
              strokeDasharray="4 4"
              fill="none"
              strokeLinejoin="round"
            />
          </svg>
          <p className="num mt-1 flex gap-4 text-[10.5px] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t-[1.5px] border-pos" /> NET
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t-[1.5px] border-dashed border-neg" /> LIAB
            </span>
            <span className="ml-auto">
              {series.days}D · FROM {formatMinor(series.first, exponent)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
