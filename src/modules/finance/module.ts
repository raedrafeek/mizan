import { registerModule } from "@/shell/module-registry";

registerModule({
  id: "finance",
  name: "Finance",
  navItems: [
    { label: "Accounts", href: "/finance/accounts" },
    { label: "Transactions", href: "/finance/transactions" },
    { label: "Categories", href: "/finance/categories" },
  ],
  dashboardCards: [], // dashboard hero/cards land in M2; the strip+quicklog are the M1 home
  alertKinds: ["budget_pace", "horizon_due", "stale_price"],
});
