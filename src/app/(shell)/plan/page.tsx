"use client";

import { useState } from "react";
import { todayISO } from "@/lib/format-money";
import { MonthNav } from "@/modules/finance/components/CashFlowCard";
import { TopCategoriesCard } from "@/modules/finance/components/TopCategoriesCard";
import { CampaignsCard } from "@/modules/finance/components/CampaignsCard";
import { HorizonCard } from "@/modules/finance/components/HorizonCard";

export default function PlanPage() {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <h1 className="text-sm font-semibold tracking-[2px] text-muted">PLAN</h1>
        <div className="ml-auto">
          <MonthNav month={month} onChange={setMonth} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TopCategoriesCard month={month} />
        <div className="flex flex-col gap-4">
          <HorizonCard />
          <CampaignsCard />
        </div>
      </div>
    </div>
  );
}
