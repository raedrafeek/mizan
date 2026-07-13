/**
 * Review stress test: inserts a large volume of clearly-marked test data
 * (prefix __RVW__), times every API endpoint against the local dev server,
 * then deletes everything it created. Run: npx tsx scripts/stress-test.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const P = "__RVW__";

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]) => a[rand(a.length)];

async function timeIt(name: string, url: string, samples = 3): Promise<string> {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const res = await fetch(BASE + url);
    await res.text();
    times.push(performance.now() - t0);
    if (!res.ok) return `${name}: HTTP ${res.status}`;
  }
  const sorted = [...times].sort((a, b) => a - b);
  return `${name}: min ${sorted[0].toFixed(0)}ms / med ${sorted[1].toFixed(0)}ms / max ${sorted[2].toFixed(0)}ms`;
}

async function main() {
  console.log("=== creating test data ===");

  // 6 accounts across currencies + kinds
  const mk = (data: Record<string, unknown>) =>
    prisma.account.create({ data: data as never });
  const accts = await Promise.all([
    mk({ name: `${P}KWD Bank`, kind: "transactional", subtype: "bank", currencyCode: "KWD", icon: "bank" }),
    mk({ name: `${P}USD Bank`, kind: "transactional", subtype: "bank", currencyCode: "USD", icon: "bank", openingBalanceMinor: 500000n }),
    mk({ name: `${P}INR Bank`, kind: "transactional", subtype: "bank", currencyCode: "INR", icon: "bank", openingBalanceMinor: 25000000n }),
    mk({ name: `${P}Credit Card`, kind: "transactional", subtype: "credit_card", currencyCode: "KWD", icon: "credit_card", isLiability: true }),
    mk({ name: `${P}Cash`, kind: "transactional", subtype: "cash", currencyCode: "KWD", icon: "wallet", openingBalanceMinor: 100000n }),
    mk({ name: `${P}BTC`, kind: "priced", subtype: "crypto", currencyCode: "USD", icon: "crypto", assetSymbol: `${P}btc`, quantity: "0.15", priceSource: "manual", manualPriceMinor: 9000000n }),
  ]);
  const transactional = accts.filter((a) => a.kind === "transactional");

  const categories = await prisma.category.findMany({ where: { archivedAt: null } });
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  // 800 transactions over 120 days, mixed currencies
  const fxByCur: Record<string, number> = { KWD: 1, USD: 0.3089, INR: 0.00326 };
  const rows = [];
  for (let i = 0; i < 800; i++) {
    const acct = pick(transactional);
    const isIncome = i % 12 === 0;
    const d = new Date(Date.now() - rand(120) * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    const exp = acct.currencyCode === "KWD" ? 3 : 2;
    const major = isIncome ? 200 + rand(600) : 1 + rand(60);
    const amountMinor = BigInt(major * 10 ** exp);
    const rate = fxByCur[acct.currencyCode] ?? 1;
    rows.push({
      accountId: acct.id,
      type: (isIncome ? "income" : "expense") as "income" | "expense",
      amountMinor,
      currencyCode: acct.currencyCode,
      fxRateToDefault: rate.toString(),
      amountDefaultMinor: BigInt(Math.round(major * rate * 1000)),
      categoryId: pick(isIncome ? incomeCats : expenseCats)?.id ?? null,
      date,
      note: `${P}txn ${i}`,
    });
  }
  await prisma.transaction.createMany({ data: rows });
  console.log(`created ${accts.length} accounts, ${rows.length} transactions`);

  // budgets on all expense categories (track ids for cleanup)
  const month = new Date().toISOString().slice(0, 7);
  const budgets = [];
  for (const c of expenseCats) {
    const existing = await prisma.budget.findFirst({ where: { categoryId: c.id, endMonth: null } });
    if (existing) continue; // don't touch the user's real budgets
    budgets.push(
      await prisma.budget.create({
        data: { categoryId: c.id, amountDefaultMinor: 100000n, startMonth: month },
      }),
    );
  }

  // campaigns + horizon
  const campaigns = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      prisma.campaign.create({
        data: {
          name: `${P}Goal ${i}`,
          targetDefaultMinor: 5000000n,
          targetDate: new Date(Date.now() + (90 + i * 90) * 86_400_000).toISOString().slice(0, 10),
          manualProgressMinor: BigInt(rand(4000000)),
        },
      }),
    ),
  );
  const horizon = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      prisma.scheduledItem.create({
        data: {
          name: `${P}Item ${i}`,
          direction: i % 3 === 0 ? "inflow" : "outflow",
          amountMinor: BigInt((50 + rand(300)) * 1000),
          currencyCode: "KWD",
          dueDate: new Date(Date.now() + rand(60) * 86_400_000).toISOString().slice(0, 10),
          accountId: transactional[0].id,
          alertDaysBefore: 10,
        },
      }),
    ),
  );
  console.log(`created ${budgets.length} budgets, ${campaigns.length} campaigns, ${horizon.length} horizon items`);

  const counts = await prisma.transaction.count();
  console.log(`total transactions in DB now: ${counts}`);

  console.log("\n=== API timings (3 samples: min/med/max) ===");
  console.log(await timeIt("GET /api/finance/accounts   ", "/api/finance/accounts"));
  console.log(await timeIt("GET /api/finance/networth   ", "/api/finance/networth"));
  console.log(await timeIt("GET /api/finance/cashflow   ", "/api/finance/cashflow"));
  console.log(await timeIt("GET /api/finance/transactions", "/api/finance/transactions"));
  console.log(await timeIt("GET /api/finance/currencies ", "/api/finance/currencies"));
  console.log(await timeIt("GET /api/finance/campaigns  ", "/api/finance/campaigns"));
  console.log(await timeIt("GET /api/finance/horizon    ", "/api/finance/horizon"));
  console.log(await timeIt("GET /api/alerts             ", "/api/alerts"));
  console.log(await timeIt("GET / (dashboard HTML)      ", "/"));

  console.log("\n=== functional spot checks ===");
  // paging
  const page1 = await fetch(`${BASE}/api/finance/transactions?take=50`).then((r) => r.json());
  console.log(`paging: got ${page1.items.length} items, nextCursor=${!!page1.nextCursor}`);
  const page2 = await fetch(`${BASE}/api/finance/transactions?take=50&cursor=${page1.nextCursor}`).then((r) => r.json());
  console.log(`page 2: got ${page2.items.length} items, no overlap=${page1.items[0].id !== page2.items[0].id}`);
  // month filter
  const mo = await fetch(`${BASE}/api/finance/cashflow?month=${month}`).then((r) => r.json());
  console.log(`cashflow ${month}: income=${mo.cashflow.incomeDefaultMinor} expense=${mo.cashflow.expenseDefaultMinor} rate=${mo.cashflow.savingsRatePct}%`);
  // alerts generated
  const alerts = await fetch(`${BASE}/api/alerts`).then((r) => r.json());
  const testAlerts = alerts.filter((a: { title: string }) => a.title.includes(P));
  console.log(`alerts total=${alerts.length}, from test data=${testAlerts.length}`);

  console.log("\n=== cleanup ===");
  const acctIds = accts.map((a) => a.id);
  const delTx = await prisma.transaction.deleteMany({ where: { accountId: { in: acctIds } } });
  await prisma.scheduledItem.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.campaign.deleteMany({ where: { name: { startsWith: P } } });
  for (const b of budgets) await prisma.budget.delete({ where: { id: b.id } });
  await prisma.account.deleteMany({ where: { id: { in: acctIds } } });
  // alerts referencing test entities (budget alerts on real categories from test budgets too)
  const delAlerts = await prisma.alert.deleteMany({
    where: {
      OR: [
        { title: { contains: P } },
        { createdAt: { gte: new Date(Date.now() - 30 * 60_000) }, kind: "budget_pace" },
      ],
    },
  });
  console.log(`deleted ${delTx.count} txns, ${acctIds.length} accounts, ${budgets.length} budgets, ${delAlerts.count} alerts`);
  const remaining = await prisma.transaction.count();
  const remainingAcct = await prisma.account.count({ where: { name: { startsWith: P } } });
  console.log(`remaining transactions: ${remaining} (user's own), leftover test accounts: ${remainingAcct}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
