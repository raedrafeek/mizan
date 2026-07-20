"use client";

import { useState } from "react";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { ConfirmButton } from "@/shell/ConfirmButton";
import { Sheet } from "@/shell/Sheet";
import { masked, usePrivacy } from "@/shell/privacy";
import { useAccounts, useCurrencies } from "../api/hooks";
import {
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useUpdateCampaign,
  type CampaignDto,
} from "../api/hooks-m3";

export function CampaignsCard() {
  const { data: campaigns } = useCampaigns();
  const [adding, setAdding] = useState(false);

  return (
    <Card
      title="GOALS"
      right={
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11.5px] text-muted hover:text-ink"
        >
          {adding ? "close" : "+ new"}
        </button>
      }
    >
      {adding && <CampaignForm onDone={() => setAdding(false)} />}
      <div className="flex flex-col gap-4">
        {(campaigns ?? []).length === 0 && !adding && (
          <p className="text-xs text-faint">
            No goals yet — set a target for a trip, a fund, anything you&apos;re saving toward.
          </p>
        )}
        {(campaigns ?? []).map((g) => (
          <CampaignRow key={g.id} campaign={g} />
        ))}
      </div>
    </Card>
  );
}

function chipFor(g: CampaignDto): { label: string; cls: string } {
  if (g.status === "paused") return { label: "PAUSED", cls: "text-faint bg-inset-2" };
  if (g.pct >= 100) return { label: "REACHED", cls: "text-pos bg-pos/10" };
  if (g.pacePct !== null) {
    const behind = g.pacePct - g.pct;
    if (behind > 5)
      return { label: `BEHIND −${behind.toFixed(0)}`, cls: "text-neg bg-neg/10" };
    return { label: "ON TRACK", cls: "text-pos bg-pos/10" };
  }
  return { label: "ACTIVE", cls: "text-muted bg-inset-2" };
}

/** Circular progress — the goal's visual signature. Ring color: green on
 * track / red when meaningfully behind pace / grey when paused. */
function GoalRing({ campaign: g, paused }: { campaign: CampaignDto; paused: boolean }) {
  const R = 22;
  const C = 2 * Math.PI * R;
  const pct = Math.min(100, Math.max(0, g.pct));
  const behind = g.pacePct !== null && g.pacePct - g.pct > 5 && g.pct < 100;
  const color = paused
    ? "var(--color-ghost)"
    : behind
      ? "var(--color-neg)"
      : "var(--color-pos)";
  return (
    <span className="relative h-[52px] w-[52px] flex-none">
      <svg width="52" height="52" className="-rotate-90">
        <circle cx="26" cy="26" r={R} fill="none" stroke="var(--color-inset-2)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[11px] font-bold">
        {g.pct}%
      </span>
    </span>
  );
}

function CampaignRow({ campaign: g }: { campaign: CampaignDto }) {
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const [open, setOpen] = useState(false);
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const chip = chipFor(g);
  const paused = g.status === "paused";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-3.5 py-1 text-left", paused && "opacity-50")}
      >
        <GoalRing campaign={g} paused={paused} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[14px] font-semibold text-ink-2">{g.name}</span>
            <span className={cn("flex-none rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.5px]", chip.cls)}>
              {chip.label}
            </span>
          </span>
          <span className="num mt-1 block truncate text-[11.5px] text-muted">
            {masked(privacy, formatMinor(g.progressMinor, exponent))} of{" "}
            {masked(privacy, formatMinor(g.targetDefaultMinor, exponent))} {currencyData?.defaultCurrency}
            {g.targetDate && ` · by ${g.targetDate}`}
            {g.linkedAccountId && " · grows with its account"}
          </span>
        </span>
        <span className="flex-none text-ghost">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>
      {open && <GoalSheet campaign={g} exponent={exponent} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Tap-through goal detail: contribute, edit, pause, delete — full-size actions. */
function GoalSheet({
  campaign: g,
  exponent,
  onClose,
}: {
  campaign: CampaignDto;
  exponent: number;
  onClose: () => void;
}) {
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const update = useUpdateCampaign();
  const del = useDeleteCampaign();
  const [editing, setEditing] = useState(false);
  const chip = chipFor(g);
  const paused = g.status === "paused";
  const isManual = !g.linkedAccountId;

  return (
    <Sheet
      onClose={onClose}
      label={`Goal: ${g.name}`}
      panelClassName="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border-4 bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl"
    >
        <div className="mb-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-2">{g.name}</p>
          <span className={cn("flex-none rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.5px]", chip.cls)}>
            {chip.label}
          </span>
          <button
            onClick={onClose}
            className="flex-none px-1 text-[18px] leading-none text-faint hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-3.5">
          <GoalRing campaign={g} paused={paused} />
          <p className="num text-[12px] text-muted">
            {masked(privacy, formatMinor(g.progressMinor, exponent))} of{" "}
            {masked(privacy, formatMinor(g.targetDefaultMinor, exponent))}{" "}
            {currencyData?.defaultCurrency}
            {g.targetDate && ` · by ${g.targetDate}`}
            {!isManual && " · progress = its account's balance"}
          </p>
        </div>

        {isManual && !paused && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10.5px] font-bold tracking-[1.5px] text-muted">
              RECORD A CONTRIBUTION
            </p>
            <ContributeForm campaign={g} exponent={exponent} onDone={onClose} />
          </div>
        )}

        {editing && (
          <div className="mt-3">
            <CampaignEditForm campaign={g} exponent={exponent} onDone={() => setEditing(false)} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-border-4 px-4 py-2 text-[11px] font-bold tracking-[0.5px] text-muted hover:text-ink"
          >
            Edit
          </button>
          <button
            onClick={() => update.mutate({ id: g.id, status: paused ? "active" : "paused" })}
            className="rounded-full border border-border-4 px-4 py-2 text-[11px] font-bold tracking-[0.5px] text-muted hover:text-ink"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <ConfirmButton
            label="Delete"
            onConfirm={() => {
              del.mutate(g.id);
              onClose();
            }}
            className="ml-auto rounded-full border border-neg/35 px-4 py-2 text-[11px] font-bold tracking-[0.5px] text-neg/80 hover:text-neg"
          />
        </div>
    </Sheet>
  );
}

// quick contribution for manual campaigns; REMOVE covers raided goals
function ContributeForm({
  campaign: g,
  exponent,
  onDone,
}: {
  campaign: CampaignDto;
  exponent: number;
  onDone: () => void;
}) {
  const update = useUpdateCampaign();
  const [amount, setAmount] = useState("");
  const [remove, setRemove] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const value = parseFloat(amount.replace("−", "-")); // accept typographic minus
  const valid = !isNaN(value) && value !== 0;

  async function submit() {
    setErr(null);
    try {
      const sign = remove || value < 0 ? -1 : 1; // typed minus removes in either mode
      const next = Math.max(
        0,
        (g.manualProgressMinor ?? 0) + sign * Math.round(Math.abs(value) * 10 ** exponent),
      );
      await update.mutateAsync({
        id: g.id,
        manualProgress: (next / 10 ** exponent).toFixed(exponent),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[9px] border border-border-3 bg-card-hover p-2.5">
      <div className="flex gap-0.5 rounded-lg border border-border-3 bg-surface p-0.5">
        <button
          onClick={() => setRemove(false)}
          className={cn(
            "rounded-md px-2 py-1 text-[9.5px] font-bold tracking-[0.5px]",
            remove ? "text-faint" : "bg-inset-2 text-pos",
          )}
        >
          ＋ ADD
        </button>
        <button
          onClick={() => setRemove(true)}
          className={cn(
            "rounded-md px-2 py-1 text-[9.5px] font-bold tracking-[0.5px]",
            remove ? "bg-inset-2 text-neg" : "text-faint",
          )}
        >
          − REMOVE
        </button>
      </div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="Amount"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) submit();
          if (e.key === "Escape") onDone();
        }}
        className="num w-24 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs outline-none"
      />
      <button
        onClick={submit}
        disabled={update.isPending || !valid}
        className="rounded-lg bg-ink px-3 py-1.5 text-[10.5px] font-bold tracking-wide text-surface disabled:opacity-60"
      >
        SAVE
      </button>
      <button onClick={onDone} className="px-1.5 text-[10.5px] text-muted hover:text-ink">
        Cancel
      </button>
      {err && <p className="num w-full text-[10.5px] text-neg">{err}</p>}
    </div>
  );
}

function CampaignEditForm({
  campaign: g,
  exponent,
  onDone,
}: {
  campaign: CampaignDto;
  exponent: number;
  onDone: () => void;
}) {
  const update = useUpdateCampaign();
  const { data: accounts } = useAccounts();
  const [name, setName] = useState(g.name);
  const [target, setTarget] = useState(
    (g.targetDefaultMinor / 10 ** exponent).toFixed(exponent),
  );
  const [targetDate, setTargetDate] = useState(g.targetDate ?? "");
  const [linkedAccountId, setLinkedAccountId] = useState(g.linkedAccountId ?? "");
  const [progress, setProgress] = useState(
    ((g.manualProgressMinor ?? 0) / 10 ** exponent).toFixed(exponent),
  );
  const [err, setErr] = useState<string | null>(null);
  const isManual = !linkedAccountId;

  async function submit() {
    setErr(null);
    try {
      await update.mutateAsync({
        id: g.id,
        name,
        target,
        targetDate: targetDate || null,
        linkedAccountId: linkedAccountId || null,
        manualProgress: isManual ? progress : undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-[9px] border border-border-3 bg-card-hover p-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-faint">
          Target
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="decimal"
            className="num w-24 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs text-ink outline-none"
          />
        </label>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="num rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
        {isManual && (
          <label className="flex items-center gap-1.5 text-[10px] text-faint">
            Saved so far
            <input
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              inputMode="decimal"
              className="num w-24 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs text-ink outline-none"
            />
          </label>
        )}
      </div>
      <select
        value={linkedAccountId}
        onChange={(e) => setLinkedAccountId(e.target.value)}
        className="rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
      >
        <option value="">Track progress manually</option>
        {(accounts ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            Progress = balance of: {a.name}
          </option>
        ))}
      </select>
      {err && <p className="num text-[10.5px] text-neg">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={update.isPending || !name || !target}
          className="rounded-lg bg-ink px-3 py-1.5 text-[10.5px] font-bold tracking-wide text-surface disabled:opacity-60"
        >
          SAVE
        </button>
        <button onClick={onDone} className="px-1.5 text-[10.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CampaignForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCampaign();
  const { data: accounts } = useAccounts();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [manualProgress, setManualProgress] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    try {
      await create.mutateAsync({
        name,
        target,
        targetDate: targetDate || undefined,
        linkedAccountId: linkedAccountId || undefined,
        manualProgress: !linkedAccountId && manualProgress ? manualProgress : undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border-3 bg-card-hover p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Wedding Fund)"
        className="rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
      />
      <div className="flex gap-2">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          inputMode="decimal"
          placeholder="Target"
          className="num w-24 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs outline-none"
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="num flex-1 rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
        />
      </div>
      <select
        value={linkedAccountId}
        onChange={(e) => setLinkedAccountId(e.target.value)}
        className="rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-xs outline-none"
      >
        <option value="">Track progress manually</option>
        {(accounts ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            Progress = balance of: {a.name}
          </option>
        ))}
      </select>
      {!linkedAccountId && (
        <input
          value={manualProgress}
          onChange={(e) => setManualProgress(e.target.value)}
          inputMode="decimal"
          placeholder="Saved so far (optional)"
          className="num rounded-lg border border-border-3 bg-surface px-2.5 py-1.5 text-right text-xs outline-none"
        />
      )}
      {err && <p className="num text-[10.5px] text-neg">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={create.isPending || !name || !target}
          className="rounded-lg bg-ink px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-surface disabled:opacity-60"
        >
          CREATE
        </button>
        <button onClick={onDone} className="px-2 text-[11px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
