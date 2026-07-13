"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CampaignCreateInput,
  CampaignUpdateInput,
  ScheduledItemCreateInput,
  ScheduledItemUpdateInput,
} from "@/lib/schemas/finance";

export interface CampaignDto {
  id: string;
  name: string;
  targetDefaultMinor: number;
  targetDate: string | null;
  linkedAccountId: string | null;
  manualProgressMinor: number | null;
  status: "active" | "paused" | "done" | "abandoned";
  progressMinor: number;
  pct: number;
  pacePct: number | null;
}

export interface HorizonItemDto {
  id: string;
  name: string;
  direction: "inflow" | "outflow";
  amountMinor: number;
  currencyCode: string;
  dueDate: string;
  recurrence: "monthly" | "yearly" | null;
  accountId: string | null;
  categoryId: string | null;
  alertDaysBefore: number;
  status: "pending" | "logged" | "skipped";
  daysUntil: number;
  warn: boolean;
}

export interface AlertDto {
  id: string;
  module: string;
  kind: string;
  severity: "info" | "warn" | "critical";
  title: string;
  createdAt: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`,
    );
  }
  return res.json();
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api<CampaignDto[]>("/api/finance/campaigns"),
    staleTime: 60_000,
  });
}

export function useHorizon() {
  return useQuery({
    queryKey: ["horizon"],
    queryFn: () => api<HorizonItemDto[]>("/api/finance/horizon"),
    staleTime: 60_000,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<AlertDto[]>("/api/alerts"),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

function useInvalidate(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

export function useCreateCampaign() {
  const inv = useInvalidate([["campaigns"]]);
  return useMutation({
    mutationFn: (input: CampaignCreateInput) =>
      api("/api/finance/campaigns", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: inv,
  });
}

export function useUpdateCampaign() {
  const inv = useInvalidate([["campaigns"]]);
  return useMutation({
    mutationFn: ({ id, ...input }: CampaignUpdateInput & { id: string }) =>
      api(`/api/finance/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: inv,
  });
}

export function useDeleteCampaign() {
  const inv = useInvalidate([["campaigns"]]);
  return useMutation({
    mutationFn: (id: string) => api(`/api/finance/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: inv,
  });
}

export function useCreateHorizonItem() {
  const inv = useInvalidate([["horizon"], ["alerts"]]);
  return useMutation({
    mutationFn: (input: ScheduledItemCreateInput) =>
      api("/api/finance/horizon", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: inv,
  });
}

export function useUpdateHorizonItem() {
  const inv = useInvalidate([["horizon"], ["alerts"]]);
  return useMutation({
    mutationFn: ({ id, ...input }: ScheduledItemUpdateInput & { id: string }) =>
      api(`/api/finance/horizon/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: inv,
  });
}

export function useLogHorizonItem() {
  const inv = useInvalidate([["horizon"], ["transactions"], ["accounts"], ["cashflow"], ["networth"], ["alerts"]]);
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/finance/horizon/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "log" }),
      }),
    onSuccess: inv,
  });
}

export function useDeleteHorizonItem() {
  const inv = useInvalidate([["horizon"], ["alerts"]]);
  return useMutation({
    mutationFn: (id: string) => api(`/api/finance/horizon/${id}`, { method: "DELETE" }),
    onSuccess: inv,
  });
}

export function useDismissAlert() {
  const inv = useInvalidate([["alerts"]]);
  return useMutation({
    mutationFn: (id: string) => api(`/api/alerts/${id}`, { method: "DELETE" }),
    onSuccess: inv,
  });
}
