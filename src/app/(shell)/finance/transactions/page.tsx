"use client";

import { Card } from "@/shell/Card";
import { TransactionList } from "@/modules/finance/components/TransactionList";

export default function Page() {
  return (
    <Card title="ALL TRANSACTIONS">
      <TransactionList />
    </Card>
  );
}
