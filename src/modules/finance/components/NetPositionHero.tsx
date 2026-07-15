"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/shell/Skeleton";
import { formatMinor } from "@/lib/money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useCurrencies } from "../api/hooks";
import { useNetWorth, useRefreshPrices } from "../api/hooks-m2";

function sparkXY(values: number[], w = 260, h = 72, pad = 4): [number, number][] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => [
    (i / (values.length - 1)) * (w - pad * 2) + pad,
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
}

const toPoints = (xy: [number, number][]) =>
  xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const toAreaPath = (xy: [number, number][], h = 72) => {
  if (xy.length < 2) return "";
  const line = xy
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join("");
  return `${line}L${xy[xy.length - 1][0].toFixed(1)},${h}L${xy[0][0].toFixed(1)},${h}Z`;
};

export function NetPositionHero() {
  const { data } = useNetWorth();
  const { data: currencyData } = useCurrencies();
  const refresh = useRefreshPrices();
  const { privacy } = usePrivacy();

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

  if (!data) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-3.5 w-44" />
      </div>
    );
  }
  const { current } = data;
  const up = (series?.delta ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-6 py-2 lg:flex-row lg:items-center lg:gap-14">
      <div>
        <p className="mb-2.5 flex items-center gap-3 text-[11px] font-semibold tracking-[2.5px] text-muted">
          NET WORTH
          {current.anyStale && <span className="text-warn normal-case tracking-normal">· some prices stale</span>}
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            aria-label="Refresh prices"
            title="Refresh prices"
            className="text-muted hover:text-ink disabled:opacity-50"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refresh.isPending ? "animate-spin" : undefined}
            >
              <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
            </svg>
          </button>
        </p>
        <p className="num text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
          {masked(privacy, formatMinor(current.netDefaultMinor, exponent))}{" "}
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
            {masked(privacy, formatMinor(Math.abs(series.delta), exponent))}
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
          <span className="num text-ink">{masked(privacy, formatMinor(current.assetsDefaultMinor, exponent))}</span>
        </p>
        <p className="flex justify-between gap-8">
          <span className="text-muted">Liabilities</span>
          <span className="num text-neg">
            {current.liabilitiesDefaultMinor > 0 && !privacy ? "−" : ""}
            {masked(privacy, formatMinor(current.liabilitiesDefaultMinor, exponent))}
          </span>
        </p>
        <p className="flex justify-between gap-8 border-t border-border pt-2.5">
          <span className="font-semibold text-ink">Net</span>
          <span className={cn("num font-semibold", up ? "text-pos" : "text-ink")}>
            {masked(privacy, formatMinor(current.netDefaultMinor, exponent))}
          </span>
        </p>
      </div>

      {series && series.days > 1 && (() => {
        const netXY = sparkXY(series.nets);
        const last = netXY[netXY.length - 1];
        const hasDebt = current.liabilitiesDefaultMinor > 0;
        return (
          <div className="w-full max-w-[260px]">
            <svg width="260" height="72" viewBox="0 0 260 72" fill="none" className="max-w-full">
              <path d={toAreaPath(netXY)} fill="rgba(53,208,127,0.09)" />
              <polyline
                points={toPoints(netXY)}
                stroke="var(--color-pos)"
                strokeWidth="1.8"
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {hasDebt && (
                <polyline
                  points={toPoints(sparkXY(series.liabs))}
                  stroke="var(--color-neg)"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                  fill="none"
                  strokeLinejoin="round"
                />
              )}
              {last && <circle cx={last[0]} cy={last[1]} r="3" fill="var(--color-pos)" />}
            </svg>
            <p className="num mt-1 flex gap-4 text-[10.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 border-t-[1.5px] border-pos" /> net worth
              </span>
              {hasDebt && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 border-t-[1.5px] border-dashed border-neg" /> debt
                </span>
              )}
              <span className="ml-auto">last {series.days} days</span>
            </p>
          </div>
        );
      })()}
    </div>
  );
}
