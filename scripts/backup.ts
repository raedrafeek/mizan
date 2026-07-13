/**
 * Dumps every table to a timestamped JSON file in backups/.
 * Run: npm run backup   (needs .env with DATABASE_URL)
 * Restore strategy: db:push a fresh schema, then insert from this file —
 * ask for a restore script when needed; the data here is complete.
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

async function main() {
  const [
    currencies,
    accounts,
    transactions,
    categories,
    budgets,
    campaigns,
    scheduledItems,
    fxRates,
    priceQuotes,
    netWorthSnapshots,
    alerts,
    settings,
  ] = await Promise.all([
    prisma.currency.findMany(),
    prisma.account.findMany(),
    prisma.transaction.findMany(),
    prisma.category.findMany(),
    prisma.budget.findMany(),
    prisma.campaign.findMany(),
    prisma.scheduledItem.findMany(),
    prisma.fxRate.findMany(),
    prisma.priceQuote.findMany(),
    prisma.netWorthSnapshot.findMany(),
    prisma.alert.findMany(),
    prisma.setting.findMany(),
  ]);

  const dump = {
    version: 1,
    exportedAt: new Date().toISOString(),
    currencies,
    accounts,
    transactions,
    categories,
    budgets,
    campaigns,
    scheduledItems,
    fxRates,
    priceQuotes,
    netWorthSnapshots,
    alerts,
    settings,
  };

  mkdirSync("backups", { recursive: true });
  const file = join(
    "backups",
    `mizan-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify(dump, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
  console.log(`${file} — ${transactions.length} transactions, ${accounts.length} accounts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
