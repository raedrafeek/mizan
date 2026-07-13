import { FinanceHome } from "@/modules/finance/components/FinanceHome";

// Phone-first quick-log route — PWA shortcut target. Same surface as home for M1;
// diverges into a stripped-down layout in M4.
export default function LogPage() {
  return <FinanceHome />;
}
