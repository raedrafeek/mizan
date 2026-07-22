/**
 * Restore-drill verification: proves a backup dump is complete and parseable
 * BEFORE it's ever needed. Checks every table the schema knows against the
 * dump's row counts and spot-checks that amounts survived BigInt→string.
 * Run: npx tsx scripts/verify-backup.ts [path-to-dump.json]
 * (defaults to the newest file in backups/)
 */
import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

const TABLES = [
  "currencies",
  "accounts",
  "transactions",
  "categories",
  "budgets",
  "campaigns",
  "scheduledItems",
  "fxRates",
  "priceQuotes",
  "netWorthSnapshots",
  "alerts",
  "settings",
] as const;

async function main() {
  let file = process.argv[2];
  if (!file) {
    const files = readdirSync("backups")
      .filter((f) => f.endsWith(".json"))
      .sort();
    if (files.length === 0) throw new Error("no backups found — run npm run backup first");
    file = join("backups", files[files.length - 1]);
  }
  const dump = JSON.parse(readFileSync(file, "utf8"));
  console.log(`verifying ${file} (exported ${dump.exportedAt})`);

  const counts = await Promise.all([
    prisma.currency.count(),
    prisma.account.count(),
    prisma.transaction.count(),
    prisma.category.count(),
    prisma.budget.count(),
    prisma.campaign.count(),
    prisma.scheduledItem.count(),
    prisma.fxRate.count(),
    prisma.priceQuote.count(),
    prisma.netWorthSnapshot.count(),
    prisma.alert.count(),
    prisma.setting.count(),
  ]);

  let failed = 0;
  TABLES.forEach((t, i) => {
    const inDump = Array.isArray(dump[t]) ? dump[t].length : -1;
    const match = inDump === counts[i];
    if (!match) failed++;
    console.log(`  ${match ? "✓" : "✗"} ${t}: dump ${inDump} / db ${counts[i]}`);
  });

  // amounts must have survived serialization as decimal strings, not floats
  const t0 = dump.transactions[0];
  if (t0 && typeof t0.amountMinor !== "string") {
    failed++;
    console.log(`  ✗ amountMinor serialized as ${typeof t0?.amountMinor} — expected string`);
  } else if (t0) {
    console.log(`  ✓ BigInt amounts serialized as strings`);
  }

  if (failed) {
    console.log(`\nBACKUP DOES NOT MATCH DB (${failed} mismatches)`);
    process.exit(1);
  }
  console.log("\nbackup verified: every table complete and parseable");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
