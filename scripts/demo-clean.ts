/**
 * Removes everything created by scripts/demo-seed.ts, using the IDs recorded
 * in the Setting row "demo.seed". Real data is untouched.
 * Run from inside mizan/: npx tsx scripts/demo-clean.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const setting = await prisma.setting.findUnique({ where: { key: "demo.seed" } });
  if (!setting) {
    console.log("No demo.seed record found — nothing to clean.");
    return;
  }
  const ids = JSON.parse(setting.valueJson) as {
    accountIds: string[];
    budgetIds: string[];
    campaignIds: string[];
    horizonIds: string[];
    snapshotDates: string[];
  };

  const txns = await prisma.transaction.deleteMany({
    where: { accountId: { in: ids.accountIds } },
  });
  await prisma.scheduledItem.deleteMany({ where: { id: { in: ids.horizonIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: ids.campaignIds } } });
  await prisma.budget.deleteMany({ where: { id: { in: ids.budgetIds } } });

  // alerts referencing demo entities (budget_pace on demo budgets, horizon_due,
  // stale_price on demo accounts — dedupeKey/entityRef embed the entity id)
  const allIds = [...ids.accountIds, ...ids.budgetIds, ...ids.campaignIds, ...ids.horizonIds];
  const alerts = await prisma.alert.deleteMany({
    where: { OR: allIds.map((id) => ({ dedupeKey: { contains: id } })) },
  });

  // demo priced accounts used "ethereum"; drop its quotes only if no other account uses it
  const demoAccounts = await prisma.account.findMany({
    where: { id: { in: ids.accountIds } },
    select: { assetSymbol: true },
  });
  await prisma.account.deleteMany({ where: { id: { in: ids.accountIds } } });
  for (const sym of demoAccounts.map((a) => a.assetSymbol).filter((s): s is string => !!s)) {
    const stillUsed = await prisma.account.count({ where: { assetSymbol: sym } });
    if (stillUsed === 0) await prisma.priceQuote.deleteMany({ where: { assetSymbol: sym } });
  }

  const snaps = await prisma.netWorthSnapshot.deleteMany({
    where: { date: { in: ids.snapshotDates } },
  });

  await prisma.setting.delete({ where: { key: "demo.seed" } });

  console.log(
    `Removed: ${txns.count} transactions, ${ids.accountIds.length} accounts, ` +
      `${ids.budgetIds.length} budgets, ${ids.campaignIds.length} campaigns, ` +
      `${ids.horizonIds.length} horizon items, ${snaps.count} snapshots, ${alerts.count} alerts.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
