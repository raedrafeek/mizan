"use client";

import { useState } from "react";
import { Card } from "@/shell/Card";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
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
      title="CAMPAIGNS"
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
            No campaigns yet — a campaign is a savings goal with a target.
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

function CampaignRow({ campaign: g }: { campaign: CampaignDto }) {
  const { data: currencyData } = useCurrencies();
  const { privacy } = usePrivacy();
  const update = useUpdateCampaign();
  const del = useDeleteCampaign();
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const exponent =
    currencyData?.currencies.find((c) => c.code === currencyData.defaultCurrency)
      ?.exponent ?? 3;
  const chip = chipFor(g);
  const paused = g.status === "paused";
  const isManual = !g.linkedAccountId;

  return (
    <div className={cn("group", paused && "opacity-50")}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink-2">{g.name}</span>
        <span className={cn("rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.5px]", chip.cls)}>
          {chip.label}
        </span>
        <span className="num ml-auto text-xs text-ink">{g.pct}%</span>
        <span className="touch-show-flex hidden gap-1 group-hover:flex">
          {isManual && !paused && (
            <button
              onClick={() => setMode(mode === "add" ? null : "add")}
              className="text-[9px] font-bold tracking-[1px] text-faint hover:text-pos"
            >
              ADD
            </button>
          )}
          <button
            onClick={() => setMode(mode === "edit" ? null : "edit")}
            className="text-[9px] font-bold tracking-[1px] text-faint hover:text-ink"
          >
            EDIT
          </button>
          <button
            onClick={() => update.mutate({ id: g.id, status: paused ? "active" : "paused" })}
            className="text-[9px] font-bold tracking-[1px] text-faint hover:text-ink"
          >
            {paused ? "RESUME" : "PAUSE"}
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete campaign "${g.name}"?`)) del.mutate(g.id);
            }}
            className="text-[9px] font-bold tracking-[1px] text-faint hover:text-neg"
          >
            DEL
          </button>
        </span>
      </div>
      {mode === "add" && (
        <ContributeForm campaign={g} exponent={exponent} onDone={() => setMode(null)} />
      )}
      {mode === "edit" && (
        <CampaignEditForm campaign={g} exponent={exponent} onDone={() => setMode(null)} />
      )}
      <div className="relative h-[5px] rounded-[3px] bg-inset-2">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-[3px]",
            paused ? "bg-ghost" : g.pacePct !== null && g.pacePct - g.pct > 5 ? "bg-neg" : "bg-warn",
          )}
          style={{ width: `${g.pct}%` }}
        />
        {g.pacePct !== null && !paused && (
          <span
            className="absolute -top-[3px] h-[11px] w-[1.5px] bg-ink"
            style={{ left: `${g.pacePct}%` }}
          />
        )}
      </div>
      <p className="num mt-1.5 text-[10px] text-faint">
        {masked(privacy, formatMinor(g.progressMinor, exponent))} <span className="text-ghost">/</span>{" "}
        {masked(privacy, formatMinor(g.targetDefaultMinor, exponent))} {currencyData?.defaultCurrency}
        {g.targetDate && ` · by ${g.targetDate}`}
        {g.linkedAccountId && " · linked"}
      </p>
    </div>
  );
}

// quick signed contribution for manual campaigns: "+100" adds, "-50" removes
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
  const [err, setErr] = useState<string | null>(null);
  const delta = parseFloat(amount.replace("−", "-")); // accept typographic minus
  const valid = !isNaN(delta) && delta !== 0;

  async function submit() {
    setErr(null);
    try {
      const next = Math.max(
        0,
        (g.manualProgressMinor ?? 0) + Math.round(delta * 10 ** exponent),
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
      <span className="text-[10px] text-faint">use − to remove (e.g. −50)</span>
      <button
        onClick={submit}
        disabled={update.isPending || !valid}
        className="rounded-lg bg-ink px-3 py-1.5 text-[10.5px] font-bold tracking-wide text-surface disabled:opacity-60"
      >
        ADD
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
