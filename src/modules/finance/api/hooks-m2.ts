"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface NetWorthResponse {
  current: {
    assetsDefaultMinor: number;
    liabilitiesDefaultMinor: number;
    netDefaultMinor: number;
    anyStale: boolean;
  };
  snapshots: {
    date: string;
    assetsDefaultMinor: number;
    liabilitiesDefaultMinor: number;
    netDefaultMinor: number;
  }[];
}

export interface CashFlowResponse {
  cashflow: {
    month: string;
    incomeDefaultMinor: number;
    expenseDefaultMinor: number;
    savingsDefaultMinor: number;
    savingsRatePct: number | null;
    dailyExpenseDefaultMinor: number[];
    incomeByCategory: { name: string; totalDefaultMinor: number }[];
  };
  categories: {
    categoryId: string;
    name: string;
    icon: string;
    spentDefaultMinor: number;
    budgetDefaultMinor: number | null;
    budgetId: string | null;
  }[];
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function useNetWorth(days = 30) {
  return useQuery({
    queryKey: ["networth", days],
    queryFn: () => get<NetWorthResponse>(`/api/finance/networth?days=${days}`),
    staleTime: 60_000,
  });
}

export interface MonthlyReportResponse {
  months: {
    month: string;
    incomeDefaultMinor: number;
    expenseDefaultMinor: number;
    savingsDefaultMinor: number;
    savingsRatePct: number | null;
  }[];
  categories: { categoryId: string; name: string; icon: string; monthly: number[] }[];
  incomeMix: { name: string; totalDefaultMinor: number }[];
}

export function useMonthlyReport(months = 12) {
  return useQuery({
    queryKey: ["monthly-report", months],
    queryFn: () => get<MonthlyReportResponse>(`/api/finance/reports/monthly?months=${months}`),
    staleTime: 5 * 60_000,
  });
}

export function useCashFlow(month?: string) {
  return useQuery({
    queryKey: ["cashflow", month ?? "current"],
    queryFn: () =>
      get<CashFlowResponse>(`/api/finance/cashflow${month ? `?month=${month}` : ""}`),
    staleTime: 30_000,
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { categoryId: string; amount: string }) =>
      fetch("/api/finance/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save budget");
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashflow"] }),
  });
}

export function useRefreshPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch("/api/finance/prices/refresh", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["networth"] });
    },
  });
}
