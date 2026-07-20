/**
 * Integrity check for the soft references that predate their FK constraints:
 * Campaign.linkedAccountId, ScheduledItem.{accountId,counterAccountId,categoryId},
 * Transaction.tradeHoldingAccountId. Read-only; exits 1 if anything dangles.
 * Run before `prisma db push` when FK-related schema changes are pending.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [accounts, categories, campaigns, scheduled, trades] = await Promise.all([
    prisma.account.findMany({ select: { id: true } }),
    prisma.category.findMany({ select: { id: true } }),
    prisma.campaign.findMany({
      select: { id: true, name: true, linkedAccountId: true },
    }),
    prisma.scheduledItem.findMany({
      select: { id: true, name: true, accountId: true, counterAccountId: true, categoryId: true },
    }),
    prisma.transaction.findMany({
      where: { tradeHoldingAccountId: { not: null } },
      select: { id: true, tradeHoldingAccountId: true },
    }),
  ]);
  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(categories.map((c) => c.id));

  const problems: string[] = [];
  for (const c of campaigns) {
    if (c.linkedAccountId && !accountIds.has(c.linkedAccountId)) {
      problems.push(`Campaign "${c.name}" (${c.id}) → missing account ${c.linkedAccountId}`);
    }
  }
  for (const s of scheduled) {
    if (s.accountId && !accountIds.has(s.accountId)) {
      problems.push(`ScheduledItem "${s.name}" (${s.id}) → missing account ${s.accountId}`);
    }
    if (s.counterAccountId && !accountIds.has(s.counterAccountId)) {
      problems.push(`ScheduledItem "${s.name}" (${s.id}) → missing counter account ${s.counterAccountId}`);
    }
    if (s.categoryId && !categoryIds.has(s.categoryId)) {
      problems.push(`ScheduledItem "${s.name}" (${s.id}) → missing category ${s.categoryId}`);
    }
  }
  for (const t of trades) {
    if (!accountIds.has(t.tradeHoldingAccountId!)) {
      problems.push(`Transaction ${t.id} → missing trade holding account ${t.tradeHoldingAccountId}`);
    }
  }

  console.log(
    `checked: ${campaigns.length} campaigns, ${scheduled.length} scheduled items, ${trades.length} trade txns`,
  );
  if (problems.length === 0) {
    console.log("no dangling references — safe to add FK constraints");
  } else {
    console.log(`DANGLING REFERENCES (${problems.length}):`);
    for (const p of problems) console.log("  " + p);
    process.exit(1);
  }
}

main().finally(() => prisma.$disconnect());
