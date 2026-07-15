import { registerModule } from "@/shell/module-registry";
import { IconActivity, IconPlan, IconAccounts } from "@/shell/nav-icons";

registerModule({
  id: "finance",
  name: "Finance",
  destinations: [
    { id: "activity", label: "Activity", href: "/activity", icon: IconActivity, order: 10 },
    { id: "plan", label: "Plan", href: "/plan", icon: IconPlan, order: 20 },
    { id: "accounts", label: "Accounts", href: "/accounts", icon: IconAccounts, order: 30 },
  ],
  dashboardCards: [], // Home composes finance components directly while finance is the only module
  alertKinds: ["budget_pace", "horizon_due", "stale_price"],
});
