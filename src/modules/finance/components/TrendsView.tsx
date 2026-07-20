"use client";

import { useState } from "react";
import { Card } from "@/shell/Card";
import { CardSkeleton } from "@/shell/Skeleton";
import { LoadError } from "@/shell/LoadError";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { masked, usePrivacy } from "@/shell/privacy";
import { useCurrencies } from "../api/hooks";
import { useMonthlyReport, useNetWorth } from "../api/hooks-m2";
import { Icon } from "./Icon";

function monthShort(month: string): string {
  return new Date(month + "-01T00:00:00").toLocaleString("en", { month: "short" });
}

function xy(values: number[], w: number, h: number, pad = 4): [number, number][] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => [
    (i / (values.length - 1)) * (w - pad * 2) + pad,
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
}

const toPoints = (pts: [number, number][]) =>
  pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const toArea = (pts: [number, number][], h: number) => {
  if (pts.length < 2) return "";
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join("");
  return `${line}L${pts[pts.length - 1][0].toFixed(1)},${h}L${pts[0][0].toFixed(1)},${h}Z`;
};

/** Activity → Trends: the long view over months. */
export function TrendsView() {
  const { data: report, isError, refetch } = useMonthlyReport(12);
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const def = currencyData?.defaultCurrency ?? "KWD";
  const whole = (minor: number) =>
    Math.round(Math.abs(minor) / 10 ** exponent).toLocaleString("en");

  if (isError) {
    return (
      <Card title="TRENDS">
        <LoadError retry={refetch} />
      </Card>
    );
  }
  if (!report) {
    return (
      <div className="flex flex-col gap-4">
        <Card title="MONTHS AT A GLANCE"><CardSkeleton rows={4} /></Card>
        <Card title="CATEGORY MOVERS"><CardSkeleton rows={5} /></Card>
      </div>
    );
  }

  const { months, categories, incomeMix } = report;
  const maxBar = Math.max(
    1,
    ...months.map((m) => Math.max(m.incomeDefaultMinor, m.expenseDefaultMinor)),
  );
  const SLOT = 30;
  const W = months.length * SLOT;

  // category movers: current month vs average of the previous 3
  const last = months.length - 1;
  const movers = categories
    .map((c) => {
      const cur = c.monthly[last];
      const prev = c.monthly.slice(Math.max(0, last - 3), last);
      const avg = prev.length ? prev.reduce((s, v) => s + v, 0) / prev.length : 0;
      return { ...c, cur, avg, delta: cur - avg };
    })
    .filter((c) => c.cur >= 1000 || c.avg >= 1000)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);

  const totalIncome = incomeMix.reduce((s, i) => s + i.totalDefaultMinor, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card title="MONTHS AT A GLANCE">
        <svg viewBox={`0 0 ${W} 140`} className="w-full">
          {months.map((m, i) => {
            const x0 = i * SLOT;
            const hIn = (m.incomeDefaultMinor / maxBar) * 100;
            const hOut = (m.expenseDefaultMinor / maxBar) * 100;
            return (
              <g key={m.month}>
                <rect
                  x={x0 + 5.5}
                  y={112 - hIn}
                  width={8}
                  height={Math.max(hIn, 1.5)}
                  rx={1.5}
                  fill="var(--color-pos)"
                  opacity={0.8}
                />
                <rect
                  x={x0 + 16.5}
                  y={112 - hOut}
                  width={8}
                  height={Math.max(hOut, 1.5)}
                  rx={1.5}
                  fill="var(--color-ink-2)"
                  opacity={0.55}
                />
                <text
                  x={x0 + SLOT / 2}
                  y={126}
                  textAnchor="middle"
                  fontSize={8}
                  fill={i === last ? "var(--color-ink)" : "var(--color-faint)"}
                  className="num"
                >
                  {monthShort(m.month)}
                </text>
                {/* mark the year at the series start and each January */}
                {(i === 0 || m.month.endsWith("-01")) && (
                  <text
                    x={x0 + SLOT / 2}
                    y={136}
                    textAnchor="middle"
                    fontSize={7.5}
                    fill="var(--color-faint)"
                    className="num"
                  >
                    ’{m.month.slice(2, 4)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-pos opacity-80" /> in
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-ink-2 opacity-55" /> out
          </span>
          <span className="ml-auto">
            this month: +{masked(privacy, whole(months[last].incomeDefaultMinor))} / −
            {masked(privacy, whole(months[last].expenseDefaultMinor))} {def}
            {months[last].savingsRatePct !== null && ` · ${months[last].savingsRatePct}% saved`}
          </span>
        </div>
      </Card>

      <Card title="CATEGORY MOVERS">
        {movers.length === 0 ? (
          <p className="text-xs text-faint">Not enough history yet — come back next month.</p>
        ) : (
          <div className="flex flex-col">
            {movers.map((c) => {
              const isNew = c.avg < 1000;
              const pct = isNew ? null : Math.round((c.delta / c.avg) * 100);
              const up = c.delta > 0;
              return (
                <div key={c.categoryId} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-inset text-muted">
                    <Icon name={c.icon} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-2">
                      {c.name}
                    </span>
                    <span className="num mt-0.5 block text-[11px] text-muted">
                      {masked(privacy, formatMinor(c.cur, exponent))} this month
                      {!isNew && ` · usually ~${masked(privacy, whole(c.avg))}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "num flex-none rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold",
                      isNew
                        ? "bg-inset-2 text-muted"
                        : up
                          ? "bg-warn/10 text-warn"
                          : "bg-pos/10 text-pos",
                    )}
                  >
                    {isNew ? "NEW" : `${up ? "+" : "−"}${Math.abs(pct!)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <NetWorthTrend />

      <Card title="INCOME MIX · LAST 12 MONTHS">
        {incomeMix.length === 0 ? (
          <p className="text-xs text-faint">No income logged yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {incomeMix.map((s) => {
              const share = totalIncome > 0 ? (s.totalDefaultMinor / totalIncome) * 100 : 0;
              return (
                <div key={s.name}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                    <span className="font-medium text-ink-2">{s.name}</span>
                    <span className="num text-muted">
                      {masked(privacy, whole(s.totalDefaultMinor))} {def}
                      <span className="text-faint"> · {share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-sm bg-inset-2">
                    <div
                      className="h-full rounded-sm bg-pos opacity-70"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const RANGES = [
  ["3M", 90],
  ["1Y", 365],
  ["ALL", 4000],
] as const;

function NetWorthTrend() {
  const [days, setDays] = useState<number>(365);
  const { data } = useNetWorth(days);
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const def = currencyData?.defaultCurrency ?? "KWD";

  const right = (
    <div className="flex gap-1">
      {RANGES.map(([label, d]) => (
        <button
          key={label}
          onClick={() => setDays(d)}
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-bold tracking-[0.5px]",
            days === d ? "bg-inset text-ink" : "text-faint hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (!data) {
    return (
      <Card title="NET WORTH" right={right}>
        <CardSkeleton rows={3} />
      </Card>
    );
  }

  const nets = [...data.snapshots.map((s) => s.netDefaultMinor), data.current.netDefaultMinor];
  const pts = xy(nets, 360, 110);
  const lastPt = pts[pts.length - 1];
  const first = nets[0];
  const delta = data.current.netDefaultMinor - first;
  const up = delta >= 0;

  return (
    <Card title="NET WORTH" right={right}>
      {nets.length < 3 ? (
        <p className="text-xs text-faint">Not enough history for this range yet.</p>
      ) : (
        <>
          <svg viewBox="0 0 360 110" className="w-full">
            <path d={toArea(pts, 110)} fill="rgba(53,208,127,0.09)" />
            <polyline
              points={toPoints(pts)}
              fill="none"
              stroke="var(--color-pos)"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill="var(--color-pos)" />}
          </svg>
          <p className="num mt-2 text-[11.5px] text-muted">
            {masked(privacy, formatMinor(first, exponent))} →{" "}
            <b className="text-ink">
              {masked(privacy, formatMinor(data.current.netDefaultMinor, exponent))}
            </b>{" "}
            {def} ·{" "}
            <span className={up ? "text-pos" : "text-neg"}>
              {up ? "+" : "−"}
              {masked(privacy, formatMinor(Math.abs(delta), exponent))}
            </span>{" "}
            over {data.snapshots.length} days
          </p>
        </>
      )}
    </Card>
  );
}
