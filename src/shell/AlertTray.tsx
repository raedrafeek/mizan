"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useAlerts, useDismissAlert } from "@/modules/finance/api/hooks-m3";

const DOT: Record<string, string> = {
  critical: "bg-neg",
  warn: "bg-warn",
  info: "bg-muted",
};

export function AlertTray() {
  const { data: alerts } = useAlerts();
  const dismiss = useDismissAlert();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const count = alerts?.length ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex text-muted hover:text-ink"
        aria-label={`Alerts (${count})`}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8.5a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 14.5 6 8.5 M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-px -top-px h-[7px] w-[7px] rounded-full border-2 border-surface bg-warn" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-[min(340px,calc(100vw-32px))] rounded-2xl border border-border-4 bg-card shadow-2xl">
          <div className="flex items-baseline border-b border-border px-4 py-3">
            <span className="text-[10.5px] font-bold tracking-[2px] text-faint">INSIGHTS</span>
            {count > 0 && (
              <button
                onClick={() => dismiss.mutate("all")}
                className="ml-auto text-[11px] text-muted hover:text-ink"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-[340px] overflow-y-auto p-1.5">
            {count === 0 && (
              <p className="px-2 py-4 text-center text-[12.5px] text-muted">
                All clear — nothing needs your attention.
              </p>
            )}
            {(alerts ?? []).map((a) => (
              <div
                key={a.id}
                className="group flex items-start gap-2.5 rounded-xl px-2.5 py-2.5 hover:bg-card-hover"
              >
                <span
                  className={cn(
                    "mt-[6px] h-1.5 w-1.5 flex-none rounded-full",
                    DOT[a.severity] ?? DOT.info,
                  )}
                />
                <span className="flex-1 text-[13px] leading-relaxed text-ink-2">{a.title}</span>
                <button
                  onClick={() => dismiss.mutate(a.id)}
                  className="touch-show -m-1 hidden p-2 text-faint opacity-0 hover:text-ink group-hover:block group-hover:opacity-100"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
