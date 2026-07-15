"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/shell/Card";
import { ConfirmButton } from "@/shell/ConfirmButton";
import { Icon } from "@/modules/finance/components/Icon";
import { useCategories, useCreateCategory } from "@/modules/finance/api/hooks";
import { useToast } from "@/shell/toast";
import type { CategoryDto } from "@/modules/finance/types";

function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; archived?: boolean }) => {
      const res = await fetch(`/api/finance/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update category");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] }); // prefix-matches the archived list too
      qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

function useArchivedCategories() {
  return useQuery({
    queryKey: ["categories", "archived"],
    queryFn: async (): Promise<CategoryDto[]> => {
      const res = await fetch("/api/finance/categories?archived=1");
      if (!res.ok) throw new Error("Failed to load archived categories");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export default function CategoriesPage() {
  const { data: categories } = useCategories();
  const create = useCreateCategory();
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");

  async function add() {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), type });
      setName("");
      toast.success(`Added "${name.trim()}"`);
    } catch {
      toast.error("Failed to add category");
    }
  }

  const groups: ["expense" | "income", string][] = [
    ["expense", "EXPENSE CATEGORIES"],
    ["income", "INCOME CATEGORIES"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card title="NEW CATEGORY">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "expense" | "income")}
            className="rounded-lg border border-border-3 bg-surface px-2.5 py-2 text-xs text-ink outline-none"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Category name (e.g. Kids, Subscriptions)…"
            className="min-w-48 flex-1 rounded-lg border border-border-3 bg-surface px-3 py-2 text-xs text-ink outline-none sm:max-w-72"
          />
          <button
            onClick={add}
            disabled={create.isPending || !name.trim()}
            className="rounded-lg bg-ink px-4 py-2 text-[11px] font-bold tracking-wide text-surface disabled:opacity-60"
          >
            ADD
          </button>
        </div>
      </Card>

      {groups.map(([t, title]) => (
        <Card key={t} title={title}>
          <div className="flex flex-col gap-0.5">
            {(categories ?? [])
              .filter((c) => c.type === t)
              .map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
          </div>
        </Card>
      ))}

      <ArchivedCategories />
    </div>
  );
}

function ArchivedCategories() {
  const { data: archived } = useArchivedCategories();
  const update = useUpdateCategory();
  const toast = useToast();
  if (!archived || archived.length === 0) return null;

  return (
    <Card title="ARCHIVED">
      <div className="flex flex-col gap-0.5">
        {archived.map((c) => (
          <div
            key={c.id}
            className="group flex items-center gap-2.5 rounded-[9px] px-1.5 py-2 hover:bg-card-hover"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-inset text-ghost">
              <Icon name={c.icon} size={13} />
            </span>
            <span className="flex-1 truncate text-[12.5px] text-faint">
              {c.name}
              <span className="ml-2 text-[9.5px] tracking-[0.5px]">{c.type.toUpperCase()}</span>
            </span>
            <button
              onClick={async () => {
                try {
                  await update.mutateAsync({ id: c.id, archived: false });
                  toast.success(`Restored "${c.name}"`);
                } catch {
                  toast.error("Restore failed");
                }
              }}
              className="p-1.5 text-[10px] font-bold tracking-[1px] text-faint hover:text-pos"
            >
              RESTORE
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CategoryRow({ category: c }: { category: CategoryDto }) {
  const update = useUpdateCategory();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.name);

  async function save() {
    if (draft.trim() && draft.trim() !== c.name) {
      try {
        await update.mutateAsync({ id: c.id, name: draft.trim() });
      } catch {
        toast.error("Rename failed");
      }
    }
    setEditing(false);
  }

  return (
    <div className="group flex items-center gap-2.5 rounded-[9px] px-1.5 py-2 hover:bg-card-hover">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-inset text-muted">
        <Icon name={c.icon} size={13} />
      </span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
          className="flex-1 rounded-lg border border-border-3 bg-surface px-2.5 py-1 text-[12.5px] text-ink outline-none"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(c.name);
            setEditing(true);
          }}
          className="flex-1 truncate text-left text-[12.5px] font-semibold text-ink-2"
          title="Click to rename"
        >
          {c.name}
        </button>
      )}
      <ConfirmButton
        label="Archive"
        confirmLabel="Archive? (restorable)"
        onConfirm={async () => {
          try {
            await update.mutateAsync({ id: c.id, archived: true });
            toast.success(`Archived "${c.name}" — existing transactions keep it`);
          } catch {
            toast.error("Archive failed");
          }
        }}
        className="touch-show p-1.5 text-[11px] font-bold tracking-[0.5px] text-faint opacity-0 hover:text-neg group-hover:opacity-100"
        armedClassName="!text-neg !opacity-100"
      />
    </div>
  );
}
