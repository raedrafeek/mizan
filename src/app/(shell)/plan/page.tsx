"use client";

import { useState } from "react";
import { todayISO } from "@/lib/format-money";
import { MonthNav } from "@/modules/finance/components/CashFlowCard";
import { TopCategoriesCard } from "@/modules/finance/components/TopCategoriesCard";
import { CampaignsCard } from "@/modules/finance/components/CampaignsCard";
import { HorizonCard } from "@/modules/finance/components/HorizonCard";
import { BudgetWizard } from "@/modules/finance/components/BudgetWizard";

export default function PlanPage() {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [wizard, setWizard] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <h1 className="text-[13px] font-bold tracking-[2px] text-muted">PLAN</h1>
        <button
          onClick={() => setWizard(true)}
          className="rounded-full border border-border-4 px-3 py-1 text-[10px] font-bold tracking-[1px] text-muted hover:text-ink"
        >
          SUGGEST BUDGETS
        </button>
        <div className="ml-auto">
          <MonthNav month={month} onChange={setMonth} />
        </div>
      </div>
      {wizard && <BudgetWizard onDone={() => setWizard(false)} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopCategoriesCard month={month} />
        <div className="flex flex-col gap-4">
          <HorizonCard />
          <CampaignsCard />
        </div>
      </div>
    </div>
  );
}
