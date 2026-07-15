"use client";

import { cn } from "@/lib/cn";
import { useAlerts, useDismissAlert } from "../api/hooks-m3";

const PRIORITY: Record<string, number> = { critical: 0, warn: 1, info: 2 };

/**
 * Home shows at most ONE insight — the highest-priority live alert,
 * dismissible in place. The full list stays behind the bell.
 */
export function InsightCard() {
  const { data: alerts } = useAlerts();
  const dismiss = useDismissAlert();

  const top = (alerts ?? [])
    .slice()
    .sort(
      (a, b) =>
        (PRIORITY[a.severity] ?? 3) - (PRIORITY[b.severity] ?? 3) ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
  if (!top) return null;

  const critical = top.severity === "critical";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        critical
          ? "border-neg/25 bg-neg/5"
          : "border-warn/25 bg-gradient-to-br from-warn/10 to-transparent",
      )}
    >
      <span
        className={cn(
          "mt-[5px] h-1.5 w-1.5 flex-none rounded-full",
          critical ? "bg-neg" : "bg-warn",
        )}
      />
      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-2">{top.title}</p>
      <button
        onClick={() => dismiss.mutate(top.id)}
        className="flex-none px-1 text-[15px] leading-none text-faint hover:text-ink"
        aria-label="Dismiss insight"
      >
        ×
      </button>
    </div>
  );
}
