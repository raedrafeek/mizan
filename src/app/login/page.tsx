"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
      router.replace("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-4">
        <span className="flex h-12 w-12 rotate-45 items-center justify-center rounded-xl border-2 border-ink">
          <span className="h-3 w-3 rounded-[3px] bg-pos" />
        </span>
        <h1 className="text-lg font-bold tracking-[4px]">MIZAN</h1>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-border-2 bg-card p-6">
        <p className="text-center text-[12.5px] text-muted">
          Welcome back — unlock your money.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
          placeholder="Password"
          autoFocus
          className="rounded-xl border border-border-3 bg-surface px-4 py-3 text-center text-sm text-ink outline-none focus:border-border-5"
        />
        <button
          onClick={unlock}
          disabled={busy || !password}
          className="rounded-xl bg-ink py-3 text-xs font-bold tracking-[2px] text-surface hover:bg-white disabled:opacity-60"
        >
          {busy ? "…" : "UNLOCK"}
        </button>
        <p className="num min-h-[15px] text-center text-[11px] text-neg">
          {err === "Failed" ? "That's not it — try again" : err}
        </p>
      </div>
    </main>
  );
}
