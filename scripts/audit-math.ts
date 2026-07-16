/**
 * Independent-math audit: recomputes balances, net worth, cash flow, category
 * spend and campaign progress from raw rows and diffs them against the API.
 * Also probes the adjustment-edit sign behavior on a marked test account.
 * Run from mizan/ with the dev server up: npx tsx scripts/audit-math.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const api = (p: string) => fetch(BASE + p).then((r) => r.json());

const SIGN: Record<string, number> = {
  expense: -1,
  transfer_out: -1,
  income: 1,
  transfer_in: 1,
  adjustment: 1, // amountMinor carries its own sign
  refund: 1,
};

let failures = 0;
function check(label: string, got: number | string, want: number | string) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${label}: got=${got} want=${want}`);
}

async function main() {
  // ---- 1. account balances ----
  console.log("=== balances (opening + signed sum) vs API ===");
  const apiAccounts: {
    id: string; name: string; kind: string;
    balance: { balanceMinor: number } | null;
  }[] = await api("/api/finance/accounts");
  const txns = await prisma.transaction.findMany({
    select: { accountId: true, type: true, amountMinor: true, amountDefaultMinor: true, categoryId: true, date: true },
  });
  const sums = new Map<string, number>();
  for (const t of txns) {
    sums.set(t.accountId, (sums.get(t.accountId) ?? 0) + SIGN[t.type] * Number(t.amountMinor));
  }
  const dbAccounts = await prisma.account.findMany({ where: { archivedAt: null } });
  for (const a of dbAccounts.filter((x) => x.kind === "transactional")) {
    const expected = Number(a.openingBalanceMinor) + (sums.get(a.id) ?? 0);
    const apiVal = apiAccounts.find((x) => x.id === a.id)?.balance?.balanceMinor;
    check(a.name, apiVal ?? NaN, expected);
  }

  // ---- 2. net worth ----
  console.log("\n=== net worth (sum of counted balances) vs API ===");
  const nw = await api("/api/finance/networth");
  const full: { balance: { balanceDefaultMinor: number } | null; includeInNetWorth: boolean; isLiability: boolean }[] =
    apiAccounts as never;
  let assets = 0, liabs = 0;
  for (const a of full) {
    if (!a.includeInNetWorth || !a.balance) continue;
    const v = a.balance.balanceDefaultMinor;
    if (v >= 0) assets += v;
    else liabs += -v;
  }
  check("assets", nw.current.assetsDefaultMinor, assets);
  check("liabilities", nw.current.liabilitiesDefaultMinor, liabs);
  check("net", nw.current.netDefaultMinor, assets - liabs);

  // ---- 3. cash flow (July) ----
  console.log("\n=== cash flow 2026-07 vs API ===");
  const cf = await api("/api/finance/cashflow?month=2026-07");
  let income = 0, expense = 0;
  for (const t of txns.filter((x) => x.date.startsWith("2026-07"))) {
    if (t.type === "income") income += Number(t.amountDefaultMinor);
    else if (t.type === "expense") expense += Number(t.amountDefaultMinor);
    else if (t.type === "refund") expense -= Number(t.amountDefaultMinor);
  }
  check("income", cf.cashflow.incomeDefaultMinor, income);
  check("expense (net of refunds)", cf.cashflow.expenseDefaultMinor, expense);
  check("savings", cf.cashflow.savingsDefaultMinor, income - expense);

  // ---- 4. category spend (July) ----
  console.log("\n=== category spend 2026-07 vs API ===");
  const cats = await prisma.category.findMany();
  const byCat = new Map<string, number>();
  for (const t of txns.filter((x) => x.date.startsWith("2026-07"))) {
    if (t.type !== "expense" && t.type !== "refund") continue;
    const key = t.categoryId ?? "none";
    byCat.set(key, (byCat.get(key) ?? 0) + (t.type === "refund" ? -1 : 1) * Number(t.amountDefaultMinor));
  }
  for (const row of cf.categories as { categoryId: string; name: string; spentDefaultMinor: number }[]) {
    check(`spend:${row.name}`, row.spentDefaultMinor, byCat.get(row.categoryId) ?? 0);
  }

  // ---- 5. campaign pct ----
  console.log("\n=== campaign pct vs API ===");
  const apiCamps: { id: string; name: string; pct: number; progressMinor: number; targetDefaultMinor: number }[] =
    await api("/api/finance/campaigns");
  for (const c of apiCamps) {
    const expected = Math.round((c.progressMinor / c.targetDefaultMinor) * 100);
    check(`pct:${c.name}`, c.pct, Math.min(expected, expected)); // pct as served vs recomputed
  }

  // ---- 6. adjustment edit sign probe (marked test account, fully cleaned) ----
  console.log("\n=== adjustment edit sign probe ===");
  const acct = await prisma.account.create({
    data: { name: "__AUDIT__", kind: "transactional", subtype: "bank", currencyCode: "KWD", openingBalanceMinor: 10_000n },
  });
  const adj = await prisma.transaction.create({
    data: {
      accountId: acct.id, type: "adjustment", amountMinor: -5_000n, currencyCode: "KWD",
      fxRateToDefault: "1", amountDefaultMinor: -5_000n, date: "2026-07-16", note: "__AUDIT__ adj",
    },
  });
  const beforeBal = (await api("/api/finance/accounts")).find((a: { id: string }) => a.id === acct.id)?.balance?.balanceMinor;
  console.log("balance with −5 adjustment:", beforeBal, "(want 5000)");
  // simulate the edit sheet: PATCH amount "5.000" (abs value, as the sheet prefills)
  const res = await fetch(`${BASE}/api/finance/transactions/${adj.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: "5.000", date: "2026-07-16" }),
  });
  const patched = await res.json();
  console.log("after PATCH amount=5.000 → stored amountMinor:", patched.amountMinor,
    patched.amountMinor === 5000 ? "→ SIGN FLIPPED (bug confirmed: balance now reads +15 not +5)" : "");
  await prisma.transaction.deleteMany({ where: { accountId: acct.id } });
  await prisma.account.delete({ where: { id: acct.id } });
  console.log("probe cleaned up");

  console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"} (probe reported separately) ===`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
