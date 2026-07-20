"use client";

import { useEffect } from "react";

/** Page-level error boundary: a render crash takes down one screen, not the app. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page error boundary:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 rotate-45 items-center justify-center rounded-xl border-2 border-ink">
        <span className="h-3 w-3 rounded-[3px] bg-warn" />
      </span>
      <p className="text-[15px] font-semibold text-ink">Something broke — your data is fine.</p>
      <p className="max-w-sm text-[12.5px] text-muted">
        The screen hit an error while drawing. Trying again usually clears it.
      </p>
      <button
        onClick={reset}
        className="rounded-xl bg-ink px-6 py-2.5 text-xs font-bold tracking-[2px] text-surface hover:bg-white"
      >
        TRY AGAIN
      </button>
    </main>
  );
}
