"use client";

/**
 * Distinct failure state for data fetches. Never render an empty state on
 * error — "No transactions yet" during an outage reads as a wiped ledger.
 */
export function LoadError({ retry }: { retry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <p className="text-xs text-warn">Couldn&apos;t load — check your connection.</p>
      {retry && (
        <button
          onClick={() => retry()}
          className="flex-none rounded-lg border border-border-3 px-3 py-1.5 text-[10.5px] font-bold tracking-[1px] text-muted hover:text-ink"
        >
          RETRY
        </button>
      )}
    </div>
  );
}
