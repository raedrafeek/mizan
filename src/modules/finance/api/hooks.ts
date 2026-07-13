"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type {
  AccountDto,
  CategoryDto,
  CurrenciesResponse,
  TransactionsPage,
} from "../types";
import type {
  AccountCreateInput,
  AccountUpdateInput,
  TransactionCreateInput,
  TransactionUpdateInput,
} from "@/lib/schemas/finance";

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

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<AccountDto[]>("/api/finance/accounts"),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api<CategoryDto[]>("/api/finance/categories"),
    staleTime: 5 * 60_000,
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: () => api<CurrenciesResponse>("/api/finance/currencies"),
    staleTime: 5 * 60_000,
  });
}

export function useTransactions(filters?: { accountId?: string; month?: string }) {
  const params = new URLSearchParams();
  if (filters?.accountId) params.set("accountId", filters.accountId);
  if (filters?.month) params.set("month", filters.month);
  return useInfiniteQuery({
    queryKey: ["transactions", filters ?? {}],
    queryFn: ({ pageParam }) =>
      api<TransactionsPage>(
        `/api/finance/transactions?${params.toString()}${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}

export function useCreateAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: AccountCreateInput) =>
      api("/api/finance/accounts", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, ...input }: AccountUpdateInput & { id: string }) =>
      api(`/api/finance/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (id: string) => api(`/api/finance/accounts/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: TransactionCreateInput) =>
      api("/api/finance/transactions", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, ...input }: TransactionUpdateInput & { id: string }) =>
      api(`/api/finance/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/finance/transactions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useReconcileAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, actualBalance }: { id: string; actualBalance: string }) =>
      api(`/api/finance/accounts/${id}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ actualBalance }),
      }),
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: "expense" | "income"; icon?: string }) =>
      api("/api/finance/categories", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}
