import { NetPositionHero } from "@/modules/finance/components/NetPositionHero";
import { FxTicker } from "@/modules/finance/components/FxTicker";
import { AccountsPage } from "@/modules/finance/components/AccountsPage";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <NetPositionHero />
      <FxTicker />
      <AccountsPage />
    </div>
  );
}
