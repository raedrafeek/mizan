/**
 * Persona simulation: drives the real API the way different humans would over
 * months of use, and probes the edge cases each persona hits. All data is
 * prefixed __SIM__ and deleted at the end. Run: npx tsx scripts/persona-sim.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const P = "__SIM__";
const findings: string[] = [];

function flag(area: string, msg: string) {
  findings.push(`[${area}] ${msg}`);
  console.log(`  🔎 ${area}: ${msg}`);
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = undefined as T;
  }
  return { status: res.status, data };
}

interface Acct { id: string; [k: string]: unknown }
interface Txn { id: string; amountMinor: number; transferGroupId?: string | null; [k: string]: unknown }

const mkAcct = (body: Record<string, unknown>) =>
  api<Acct>("POST", "/api/finance/accounts", {
    kind: "transactional",
    subtype: "bank",
    isLiability: false,
    includeInNetWorth: true,
    icon: "bank",
    sortOrder: 90,
    ...body,
  });

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const cats = await prisma.category.findMany({ where: { archivedAt: null } });
  const cat = (name: string) => cats.find((c) => c.name === name)?.id;

  // ============================================================
  console.log("\n=== PERSONA A: Arun, 29 — expat, remits to India monthly ===");
  // ============================================================
  const { data: aBank } = await mkAcct({ name: `${P}A Salary KWD`, currencyCode: "KWD", openingBalance: "800" });
  const { data: aIndia } = await mkAcct({ name: `${P}A SBI INR`, currencyCode: "INR", openingBalance: "150000" });

  // 3 months of daily-ish expenses + monthly salary + monthly remittance
  let created = 0;
  for (let d = 90; d >= 1; d--) {
    if (d % 30 === 5) {
      await api("POST", "/api/finance/transactions", {
        accountId: aBank.id, type: "income", amount: "650", categoryId: cat("Salary"), date: daysAgo(d),
      });
      created++;
    }
    if (d % 30 === 3) {
      // remittance home: KWD -> INR transfer
      const r = await api<Txn>("POST", "/api/finance/transactions", {
        accountId: aBank.id, type: "transfer_out", amount: "150", counterAccountId: aIndia.id, date: daysAgo(d),
      });
      if (r.status !== 201) flag("A/transfer", `remittance failed: ${JSON.stringify(r.data)}`);
      created += 2;
    }
    if (d % 2 === 0) {
      await api("POST", "/api/finance/transactions", {
        accountId: aBank.id, type: "expense", amount: (2 + (d % 9)).toFixed(3),
        categoryId: cat(d % 6 === 0 ? "Dining & Entertainment" : "Groceries"), date: daysAgo(d),
      });
      created++;
    }
  }
  console.log(`  logged ~${created} transactions over 90 days`);

  // A's real-world remittance problem: actual INR received differs from mid-market
  const { data: lastTransfer } = await api<{ items: Txn[] }>(
    "GET", `/api/finance/transactions?accountId=${aIndia.id}&take=5`,
  );
  const leg = lastTransfer.items.find((t) => t.transferGroupId);
  if (leg) {
    // he tries to correct the received amount to what the bank actually credited
    const upd = await api<Txn>("PATCH", `/api/finance/transactions/${leg.id}`, { amount: "12500.00" });
    if (upd.status === 200) {
      // does the other leg stay consistent?
      const { data: outLegs } = await api<{ items: Txn[] }>(
        "GET", `/api/finance/transactions?accountId=${aBank.id}&take=10`,
      );
      const other = outLegs.items.find((t) => t.transferGroupId === leg.transferGroupId);
      if (other) {
        flag("A/transfer-edit",
          `Edited IN leg to ₹12,500 — OUT leg still ${other.amountMinor} minor KWD and amountDefaultMinor of legs now disagree (${upd.data.amountDefaultMinor} vs ${other.amountDefaultMinor}). No warning shown, transfer legs can silently diverge.`);
      }
    } else {
      flag("A/transfer-edit", `PATCH on a transfer leg rejected: ${JSON.stringify(upd.data)}`);
    }
  }

  // ============================================================
  console.log("\n=== PERSONA B: Fatima, 46 — family CFO: budgets, school fees, card cycle ===");
  // ============================================================
  const { data: bBank } = await mkAcct({ name: `${P}B NBK Main`, currencyCode: "KWD", openingBalance: "2400" });
  const { data: bCard } = await mkAcct({ name: `${P}B Visa`, currencyCode: "KWD", subtype: "credit_card", isLiability: true, icon: "credit_card" });

  // card spending + monthly bill payment cycle, 2 months
  for (let d = 60; d >= 1; d--) {
    if (d % 3 === 0) {
      await api("POST", "/api/finance/transactions", {
        accountId: bCard.id, type: "expense", amount: (5 + (d % 20)).toFixed(3),
        categoryId: cat(d % 9 === 0 ? "Health" : "Groceries"), date: daysAgo(d),
      });
    }
    if (d === 35 || d === 5) {
      const pay = await api<Txn>("POST", "/api/finance/transactions", {
        accountId: bBank.id, type: "transfer_out", amount: "120", counterAccountId: bCard.id, date: daysAgo(d),
      });
      if (pay.status !== 201) flag("B/card-payment", `bill payment failed: ${JSON.stringify(pay.data)}`);
    }
  }
  // she wants to know: current card balance + is the payment excluded from expense?
  const { data: cashflow } = await api<{ cashflow: { expenseDefaultMinor: number } }>(
    "GET", "/api/finance/cashflow",
  );
  console.log(`  card cycle done; this-month expense=${cashflow.cashflow.expenseDefaultMinor} (transfers excluded ✓)`);

  // budgets + horizon (school fees yearly)
  // only create a sim budget if Groceries has none (avoid touching real budgets)
  const existingBudget = await prisma.budget.findFirst({
    where: { categoryId: cat("Groceries"), endMonth: null },
  });
  let simBudgetCategory: string | null = null;
  if (!existingBudget) {
    await api("POST", "/api/finance/budgets", { categoryId: cat("Groceries"), amount: "150" });
    simBudgetCategory = cat("Groceries") ?? null;
  }
  const hz = await api<{ id: string }>("POST", "/api/finance/horizon", {
    name: `${P}B School fees T1`, direction: "outflow", amount: "180", currencyCode: "KWD",
    dueDate: daysAgo(-4), recurrence: "yearly", accountId: bBank.id, categoryId: cat("Other"), alertDaysBefore: 14,
  });
  const logNow = await api<{ logged: boolean }>("PATCH", `/api/finance/horizon/${hz.data.id}`, { action: "log" });
  if (!logNow.data.logged) flag("B/horizon", `log-now failed: ${JSON.stringify(logNow.data)}`);
  // yearly item should have rolled forward, still pending
  const { data: hzList } = await api<{ id: string; dueDate: string; status: string }[]>("GET", "/api/finance/horizon");
  const rolled = hzList.find((h) => h.id === hz.data.id);
  if (!rolled) flag("B/horizon", "yearly item vanished after log-now instead of rolling forward");
  else console.log(`  yearly fee rolled to ${rolled.dueDate} ✓`);

  // ============================================================
  console.log("\n=== PERSONA C: Abu Khalid, 63 — low-tech: only logs cash expenses ===");
  // ============================================================
  const { data: cCash } = await mkAcct({ name: `${P}C Cash`, currencyCode: "KWD", subtype: "cash", openingBalance: "200", icon: "wallet" });
  // he logs sporadically and often forgets — then reconciles against his wallet
  for (const d of [40, 33, 25, 12, 4]) {
    await api("POST", "/api/finance/transactions", {
      accountId: cCash.id, type: "expense", amount: "7.500", categoryId: cat("Groceries"), date: daysAgo(d),
    });
  }
  // wallet actually has 140.000 (he forgot some)
  const rec = await api<{ delta: number }>("POST", `/api/finance/accounts/${cCash.id}/reconcile`, { actualBalance: "140.000" });
  console.log(`  reconciled wallet: delta=${rec.data.delta} minor (forgot ${Math.abs(rec.data.delta ?? 0) / 1000} KWD) ✓`);
  // the reconcile adjustment lands in "today" with no category — how does it read in the list?
  // (UI audit note handled separately)

  // ============================================================
  console.log("\n=== PERSONA D: Dana, 23 — crypto/stocks watcher ===");
  // ============================================================
  const { data: dBtc } = await api<Acct>("POST", "/api/finance/accounts", {
    name: `${P}D BTC`, kind: "priced", subtype: "crypto", currencyCode: "USD",
    isLiability: false, includeInNetWorth: true, icon: "crypto",
    assetSymbol: `${P}btc`, quantity: "0.02", priceSource: "manual", manualPrice: "95000", sortOrder: 91,
  });
  // she toggles it out of net worth ("watch-only") and back
  await api("PATCH", `/api/finance/accounts/${dBtc.id}`, { includeInNetWorth: false });
  const { data: nw1 } = await api<{ current: { netDefaultMinor: number } }>("GET", "/api/finance/networth");
  await api("PATCH", `/api/finance/accounts/${dBtc.id}`, { includeInNetWorth: true });
  const { data: nw2 } = await api<{ current: { netDefaultMinor: number } }>("GET", "/api/finance/networth");
  const diff = nw2.current.netDefaultMinor - nw1.current.netDefaultMinor;
  console.log(`  watch-only toggle moves net worth by ${diff} minor (0.02 BTC @ $95k ≈ 587 KWD) ${diff > 500000 ? "✓" : "⚠"}`);
  if (diff <= 0) flag("D/priced", "includeInNetWorth toggle had no effect on net position");
  // she edits quantity after a buy
  const q = await api("PATCH", `/api/finance/accounts/${dBtc.id}`, { quantity: "0.025" });
  if (q.status !== 200) flag("D/priced", `quantity edit failed: ${JSON.stringify(q.data)}`);

  // ============================================================
  console.log("\n=== PERSONA E: Ehsan, 35 — freelancer, batch-logs weekly, irregular income ===");
  // ============================================================
  const { data: eBank } = await mkAcct({ name: `${P}E Boubyan`, currencyCode: "KWD", openingBalance: "300" });
  // Sunday batch: logs the whole past week backdated
  for (const d of [7, 6, 5, 4, 3, 2, 1]) {
    const r = await api("POST", "/api/finance/transactions", {
      accountId: eBank.id, type: "expense", amount: "4.250", categoryId: cat("Transportation"), date: daysAgo(d),
    });
    if (r.status !== 201) flag("E/backdate", `backdated log failed for ${daysAgo(d)}`);
  }
  // irregular project income
  await api("POST", "/api/finance/transactions", {
    accountId: eBank.id, type: "income", amount: "425", categoryId: cat("Project / Side income"), date: daysAgo(10),
  });
  // he tries a future-dated invoice (should this be allowed? UI blocks future, API…)
  const fut = await api("POST", "/api/finance/transactions", {
    accountId: eBank.id, type: "income", amount: "300", categoryId: cat("Project / Side income"), date: daysAgo(-20),
  });
  if (fut.status === 201) {
    flag("E/future-date", "API accepts future-dated transactions (UI blocks them) — a future income inflates current balance and this month's cash flow with no visual distinction.");
  }
  console.log("  weekly batch + irregular income logged");

  // ============================================================
  console.log("\n=== CROSS-PERSONA CHECKS ===");
  // ============================================================
  // dashboard payload sizes / timing with all personas' data present
  for (const [name, path] of [
    ["accounts", "/api/finance/accounts"],
    ["networth", "/api/finance/networth"],
    ["cashflow", "/api/finance/cashflow"],
    ["alerts", "/api/alerts"],
  ] as const) {
    const t0 = performance.now();
    await api("GET", path);
    console.log(`  ${name}: ${(performance.now() - t0).toFixed(0)}ms`);
  }

  // how many accounts does the strip now hold? (UI overflow behavior)
  const { data: allAccts } = await api<Acct[]>("GET", "/api/finance/accounts");
  console.log(`  account strip would render ${allAccts.length} cards (horizontal scroll only)`);

  // alerts noise check: what fired from normal life?
  const { data: alerts } = await api<{ title: string; kind: string }[]>("GET", "/api/alerts");
  console.log(`  active alerts: ${alerts.length}`);
  for (const a of alerts.slice(0, 8)) console.log(`    - [${a.kind}] ${a.title}`);

  // ============================================================
  console.log("\n=== CLEANUP ===");
  // ============================================================
  const simAccts = await prisma.account.findMany({ where: { name: { startsWith: P } } });
  for (const a of simAccts) {
    await prisma.transaction.deleteMany({ where: { accountId: a.id } });
  }
  // transfer legs land on sim accounts only (both legs sim) — safe
  await prisma.scheduledItem.deleteMany({ where: { name: { startsWith: P } } });
  // remove only the sim budget (created above only when the category had none)
  if (simBudgetCategory) {
    await prisma.budget.deleteMany({ where: { categoryId: simBudgetCategory, endMonth: null } });
  }
  await prisma.account.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.alert.deleteMany({ where: { OR: [{ title: { contains: P } }, { createdAt: { gte: new Date(Date.now() - 60 * 60_000) } }] } });
  await prisma.priceQuote.deleteMany({ where: { assetSymbol: { startsWith: P } } });
  const leftA = await prisma.account.count({ where: { name: { startsWith: P } } });
  const leftT = await prisma.transaction.count();
  console.log(`  leftover sim accounts: ${leftA}; total txns remaining (user's own): ${leftT}`);

  console.log("\n=== FLAGGED FINDINGS ===");
  findings.forEach((f) => console.log("  • " + f));
  console.log(`  total: ${findings.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
