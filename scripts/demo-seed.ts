/**
 * Demo data seeder: creates realistic accounts + ~1 year of daily activity
 * (salary, rent, groceries, dining, fuel, subscriptions, card payments,
 * remittances, travel spikes), budgets, campaigns, horizon items, and
 * backfilled net-worth snapshots — so the app feels like a year of real use.
 *
 * Everything created is tracked by ID in the Setting row "demo.seed".
 * Remove it all precisely with: npx tsx scripts/demo-clean.ts
 * The user's real accounts/transactions are never touched.
 *
 * Run from inside mizan/: npx tsx scripts/demo-seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// deterministic PRNG so re-runs of the story are reproducible
let seed = 20260714;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const rand = (n: number) => Math.floor(rnd() * n);
const pick = <T>(a: T[]) => a[rand(a.length)];
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);

const DAY = 86_400_000;
const TODAY = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10); // Kuwait
const START = new Date(new Date(TODAY + "T00:00:00Z").getTime() - 364 * DAY)
  .toISOString()
  .slice(0, 10);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  iso(new Date(new Date(date + "T00:00:00Z").getTime() + n * DAY));

// FX to KWD, drifting gently over the year for realistic frozen rates
function usdRate(date: string): number {
  const t = new Date(date + "T00:00:00Z").getTime() / DAY;
  return 0.3065 + 0.003 * Math.sin(t / 40);
}
function inrRate(date: string): number {
  const t = new Date(date + "T00:00:00Z").getTime() / DAY;
  return 0.00368 + 0.00005 * Math.sin(t / 55 + 2);
}

type TxnRow = {
  accountId: string;
  type: "expense" | "income" | "transfer_out" | "transfer_in";
  amountMinor: bigint;
  currencyCode: string;
  fxRateToDefault: string;
  amountDefaultMinor: bigint;
  categoryId: string | null;
  date: string;
  note: string | null;
  transferGroupId: string | null;
};

async function main() {
  const existing = await prisma.setting.findUnique({ where: { key: "demo.seed" } });
  if (existing) {
    console.error("demo.seed already exists — run scripts/demo-clean.ts first.");
    process.exit(1);
  }

  console.log(`Seeding demo data ${START} → ${TODAY}`);

  // ---- accounts -----------------------------------------------------
  const mk = (data: Record<string, unknown>) =>
    prisma.account.create({ data: data as never });
  const [nbk, savings, cash, card, wise, nre, eth, aapl] = await Promise.all([
    mk({ name: "NBK Current", kind: "transactional", subtype: "bank", currencyCode: "KWD", icon: "bank", openingBalanceMinor: 612_000n, mask: "•••• 4471" }),
    mk({ name: "Boubyan Savings", kind: "transactional", subtype: "bank", currencyCode: "KWD", icon: "bank", openingBalanceMinor: 1_850_000n, sortOrder: 1 }),
    mk({ name: "Cash Wallet", kind: "transactional", subtype: "cash", currencyCode: "KWD", icon: "wallet", openingBalanceMinor: 35_500n, sortOrder: 2 }),
    mk({ name: "Visa Signature", kind: "transactional", subtype: "credit_card", currencyCode: "KWD", icon: "credit_card", isLiability: true, mask: "•••• 8027", sortOrder: 3 }),
    mk({ name: "Wise USD", kind: "transactional", subtype: "bank", currencyCode: "USD", icon: "bank", openingBalanceMinor: 84_250n, sortOrder: 4 }),
    mk({ name: "Federal Bank NRE", kind: "transactional", subtype: "bank", currencyCode: "INR", icon: "bank", openingBalanceMinor: 14_200_000n, sortOrder: 5 }),
    mk({ name: "Ethereum", kind: "priced", subtype: "crypto", currencyCode: "USD", icon: "crypto", assetSymbol: "ethereum", quantity: "0.85", priceSource: "coingecko", sortOrder: 6 }),
    mk({ name: "Apple Inc.", kind: "priced", subtype: "stock", currencyCode: "USD", icon: "stock", assetSymbol: "AAPL", quantity: "12", priceSource: "manual", manualPriceMinor: 23_618n, sortOrder: 7 }),
  ]);
  console.log("accounts created: 8");

  // ---- categories ---------------------------------------------------
  const cats = await prisma.category.findMany({ where: { archivedAt: null } });
  const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
  const GROC = cat("Groceries"), HOUS = cat("Housing"), TRAN = cat("Transportation"),
    HLTH = cat("Health"), DINE = cat("Dining & Entertainment"), FIN = cat("Financial"),
    OTHR = cat("Other"), SAL = cat("Salary"), BON = cat("Bonus"),
    PROJ = cat("Project / Side income");

  // ---- transaction story --------------------------------------------
  const rows: TxnRow[] = [];
  const kwd = (major: number) => BigInt(Math.round(major * 1000));

  function kwdTxn(acct: { id: string }, type: "expense" | "income", major: number, categoryId: string | null, date: string, note: string | null = null) {
    const m = kwd(major);
    rows.push({ accountId: acct.id, type, amountMinor: m, currencyCode: "KWD", fxRateToDefault: "1", amountDefaultMinor: m, categoryId, date, note, transferGroupId: null });
  }
  function usdTxn(type: "expense" | "income", major: number, categoryId: string | null, date: string, note: string | null = null) {
    const rate = usdRate(date);
    rows.push({ accountId: wise.id, type, amountMinor: BigInt(Math.round(major * 100)), currencyCode: "USD", fxRateToDefault: rate.toFixed(6), amountDefaultMinor: BigInt(Math.round(major * rate * 1000)), categoryId, date, note, transferGroupId: null });
  }
  function inrTxn(type: "expense" | "income", major: number, categoryId: string | null, date: string, note: string | null = null) {
    const rate = inrRate(date);
    rows.push({ accountId: nre.id, type, amountMinor: BigInt(Math.round(major * 100)), currencyCode: "INR", fxRateToDefault: rate.toFixed(8), amountDefaultMinor: BigInt(Math.round(major * rate * 1000)), categoryId, date, note, transferGroupId: null });
  }
  // KWD → KWD transfer (both legs same value)
  function kwdTransfer(from: { id: string }, to: { id: string }, major: number, date: string, note: string | null = null) {
    const g = randomUUID();
    const m = kwd(major);
    rows.push({ accountId: from.id, type: "transfer_out", amountMinor: m, currencyCode: "KWD", fxRateToDefault: "1", amountDefaultMinor: m, categoryId: null, date, note, transferGroupId: g });
    rows.push({ accountId: to.id, type: "transfer_in", amountMinor: m, currencyCode: "KWD", fxRateToDefault: "1", amountDefaultMinor: m, categoryId: null, date, note, transferGroupId: g });
  }
  // remittance: KWD out, INR in with its own value (gap = transfer fee)
  function remit(majorKwd: number, date: string) {
    const g = randomUUID();
    const out = kwd(majorKwd);
    const rate = inrRate(date);
    const inrMajor = Math.round((majorKwd / rate) * 0.988); // ~1.2% fee/spread
    rows.push({ accountId: nbk.id, type: "transfer_out", amountMinor: out, currencyCode: "KWD", fxRateToDefault: "1", amountDefaultMinor: out, categoryId: null, date, note: "Remittance home", transferGroupId: g });
    rows.push({ accountId: nre.id, type: "transfer_in", amountMinor: BigInt(inrMajor * 100), currencyCode: "INR", fxRateToDefault: rate.toFixed(8), amountDefaultMinor: BigInt(Math.round(inrMajor * rate * 1000)), categoryId: null, date, note: "Remittance home", transferGroupId: g });
  }

  const grocers = ["Lulu Hypermarket", "Sultan Center", "Carrefour Avenues", "Co-op", "Saveco"];
  const dining = ["Talabat", "Shake Shack", "Mais Alghanim", "Slider Station", "Pick", "Ovacado", "Deliveroo"];
  const coffee = ["Caribou", "% Arabica", "Starbucks", "Vol.1"];
  const shops = ["Amazon", "Xcite", "H&M Avenues", "IKEA", "Noon", "Eureka"];

  let cardMonthSpend = 0; // paid off on the 28th

  for (let d = START; d <= TODAY; d = addDays(d, 1)) {
    const dt = new Date(d + "T00:00:00Z");
    const dom = dt.getUTCDate();
    const dow = dt.getUTCDay();
    const month = d.slice(0, 7);
    const isDecTrip = month === "2025-12" && dom >= 18 && dom <= 30; // India trip

    // -------- monthly fixed --------
    if (dom === 1) kwdTxn(nbk, "income", month >= "2026-01" ? 1985 : 1875, SAL, d, "Salary");
    if (dom === 2) kwdTxn(nbk, "expense", 320, HOUS, d, "Rent");
    if (dom === 3) kwdTransfer(nbk, savings, 450, d, "Monthly savings");
    if (dom === 4) kwdTransfer(nbk, cash, 110, d, "ATM withdrawal");
    if (dom === 5) kwdTxn(nbk, "expense", 8.5, OTHR, d, "Zain postpaid");
    if (dom === 8) kwdTxn(nbk, "expense", 23, HOUS, d, "Ooredoo internet");
    if (dom === 12) kwdTxn(nbk, "expense", between(22, 46), HOUS, d, "Electricity & water");
    if (dom === 17) { kwdTxn(card, "expense", 4.9, DINE, d, "Netflix"); cardMonthSpend += 4.9; }
    if (dom === 20) { kwdTxn(card, "expense", 2.1, DINE, d, "Spotify"); cardMonthSpend += 2.1; }
    if (dom === 22) { kwdTxn(card, "expense", 0.9, OTHR, d, "iCloud"); cardMonthSpend += 0.9; }
    if (dom === 28 && cardMonthSpend > 0) {
      kwdTransfer(nbk, card, Math.round(cardMonthSpend * 1000) / 1000, d, "Card payment");
      cardMonthSpend = 0;
    }

    // -------- periodic --------
    if (dom === 15 && ["2025-08", "2025-11", "2026-02", "2026-05"].includes(month)) remit(200, d);
    if (dom === 10 && ["2025-09", "2025-11", "2026-01", "2026-03", "2026-05", "2026-07"].includes(month))
      usdTxn("income", between(320, 880), PROJ, d, "Freelance project");
    if (d === "2026-01-06") kwdTxn(nbk, "income", 950, BON, d, "Annual bonus");
    if (d === "2026-03-14") { kwdTxn(card, "expense", 145, TRAN, d, "Car repair — brakes"); cardMonthSpend += 145; }
    if (d === "2025-12-16") { kwdTxn(card, "expense", 186, TRAN, d, "Kuwait Airways — KWI–COK"); cardMonthSpend += 186; }
    if (d === "2026-06-02") { kwdTxn(card, "expense", 210, DINE, d, "Eid gifts & outings"); cardMonthSpend += 210; }

    // India trip: spend from the INR account instead of local dailies
    if (isDecTrip) {
      if (rnd() < 0.8) inrTxn("expense", between(300, 2500), pick([DINE, GROC, TRAN, OTHR]), d, pick(["Swiggy", "Auto rickshaw", "More Supermarket", "Family dinner", "Shopping"]));
      if (rnd() < 0.25) inrTxn("expense", between(2000, 9000), OTHR, d, "Gifts for family");
      continue; // skip Kuwait dailies while travelling
    }

    // -------- daily randoms --------
    if (rnd() < 0.42) { // groceries ~3x/week
      const useCard = rnd() < 0.5;
      const amt = between(6, 38);
      kwdTxn(useCard ? card : nbk, "expense", amt, GROC, d, pick(grocers));
      if (useCard) cardMonthSpend += amt;
    }
    if (rnd() < 0.34) { // dining ~2-3x/week
      const useCard = rnd() < 0.6;
      const amt = between(2.5, 18);
      kwdTxn(useCard ? card : cash, "expense", amt, DINE, d, pick(dining));
      if (useCard) cardMonthSpend += amt;
    }
    if (rnd() < 0.4) kwdTxn(cash, "expense", between(1.2, 3.8), DINE, d, pick(coffee)); // coffee
    if (dow === 6 && rnd() < 0.9) kwdTxn(nbk, "expense", between(6.5, 9), TRAN, d, "KNPC fuel"); // Saturday fill-up
    if (rnd() < 0.13) { // shopping ~1x/week
      const amt = between(4, 65);
      kwdTxn(card, "expense", amt, pick([OTHR, OTHR, FIN]), d, pick(shops));
      cardMonthSpend += amt;
    }
    if (rnd() < 0.05) kwdTxn(nbk, "expense", between(4, 42), HLTH, d, pick(["Pharmacy", "Clinic visit", "Dental"]));
  }

  // chunked insert
  for (let i = 0; i < rows.length; i += 250) {
    await prisma.transaction.createMany({ data: rows.slice(i, i + 250) });
  }
  console.log(`transactions created: ${rows.length}`);

  // ---- budgets (only where the category has none) --------------------
  const budgetPlan: [string | null, number][] = [
    [GROC, 220], [DINE, 140], [TRAN, 60], [HLTH, 40], [HOUS, 400], [OTHR, 160],
  ];
  const budgetIds: string[] = [];
  for (const [categoryId, major] of budgetPlan) {
    if (!categoryId) continue;
    const has = await prisma.budget.findFirst({ where: { categoryId, endMonth: null } });
    if (has) continue;
    const b = await prisma.budget.create({
      data: { categoryId, amountDefaultMinor: kwd(major), startMonth: START.slice(0, 7) },
    });
    budgetIds.push(b.id);
  }
  console.log(`budgets created: ${budgetIds.length}`);

  // ---- campaigns ------------------------------------------------------
  // backdated createdAt so pace markers are meaningful
  const campaigns = await Promise.all([
    prisma.campaign.create({ data: { name: "Emergency Fund", targetDefaultMinor: 10_000_000n, targetDate: "2026-12-31", linkedAccountId: savings.id, createdAt: new Date(START + "T08:00:00Z") } }),
    prisma.campaign.create({ data: { name: "Japan Trip 2027", targetDefaultMinor: 1_500_000n, targetDate: "2027-03-01", manualProgressMinor: 420_000n, createdAt: new Date("2026-02-01T08:00:00Z") } }),
    prisma.campaign.create({ data: { name: "New Car Down Payment", targetDefaultMinor: 3_000_000n, targetDate: "2027-06-01", manualProgressMinor: 610_000n, createdAt: new Date("2026-04-01T08:00:00Z") } }),
  ]);

  // ---- horizon ---------------------------------------------------------
  const horizon = await Promise.all([
    prisma.scheduledItem.create({ data: { name: "Car insurance renewal", direction: "outflow", amountMinor: 152_000n, currencyCode: "KWD", dueDate: addDays(TODAY, 16), recurrence: "yearly", accountId: nbk.id, categoryId: TRAN, alertDaysBefore: 14 } }),
    prisma.scheduledItem.create({ data: { name: "iPhone installment", direction: "outflow", amountMinor: 24_500n, currencyCode: "KWD", dueDate: addDays(TODAY, 6), recurrence: "monthly", accountId: nbk.id, categoryId: OTHR } }),
    prisma.scheduledItem.create({ data: { name: "Civil ID renewal fee", direction: "outflow", amountMinor: 10_000n, currencyCode: "KWD", dueDate: addDays(TODAY, 41), accountId: nbk.id, categoryId: OTHR } }),
    prisma.scheduledItem.create({ data: { name: "Flight home — Onam", direction: "outflow", amountMinor: 195_000n, currencyCode: "KWD", dueDate: addDays(TODAY, 38), accountId: nbk.id, categoryId: TRAN } }),
    prisma.scheduledItem.create({ data: { name: "Indemnity payout (old job)", direction: "inflow", amountMinor: 780_000n, currencyCode: "KWD", dueDate: addDays(TODAY, 24), accountId: nbk.id, categoryId: BON } }),
  ]);
  console.log(`campaigns: ${campaigns.length}, horizon items: ${horizon.length}`);

  // ---- net worth snapshots (backfill only missing dates) ---------------
  // end value ≈ demo accounts' current worth + latest real snapshot (if any)
  const SIGN: Record<string, number> = { expense: -1, transfer_out: -1, income: 1, transfer_in: 1 };
  const balByAcct = new Map<string, number>();
  for (const a of [nbk, savings, cash, card, wise, nre]) balByAcct.set(a.id, 0);
  const opening: Record<string, number> = {
    [nbk.id]: 612_000, [savings.id]: 1_850_000, [cash.id]: 35_500,
    [card.id]: 0, [wise.id]: Math.round(84_250 * usdRate(START) * 10), [nre.id]: Math.round(142_000 * inrRate(START) * 1000),
  };
  // per-day cumulative default-currency deltas
  const deltaByDate = new Map<string, number>();
  for (const r of rows) {
    const s = SIGN[r.type];
    deltaByDate.set(r.date, (deltaByDate.get(r.date) ?? 0) + s * Number(r.amountDefaultMinor));
  }
  const pricedNow = Math.round((0.85 * 3420 + 12 * 236.18) * usdRate(TODAY) * 1000); // ETH+AAPL est.
  const latestReal = await prisma.netWorthSnapshot.findFirst({ orderBy: { date: "desc" } });
  const realNet = latestReal ? Number(latestReal.netDefaultMinor) : 0;

  let running = Object.values(opening).reduce((s, v) => s + v, 0);
  const snapDates: string[] = [];
  const existingDates = new Set(
    (await prisma.netWorthSnapshot.findMany({ select: { date: true } })).map((s) => s.date),
  );
  const snaps: { date: string; assetsDefaultMinor: bigint; liabilitiesDefaultMinor: bigint; netDefaultMinor: bigint; breakdownJson: string }[] = [];
  for (let d = START; d < TODAY; d = addDays(d, 1)) {
    running += deltaByDate.get(d) ?? 0;
    if (existingDates.has(d)) continue;
    // priced assets drift over the year toward today's estimate
    const progress = (new Date(d + "T00:00:00Z").getTime() - new Date(START + "T00:00:00Z").getTime()) / (364 * DAY);
    const priced = Math.round(pricedNow * (0.78 + 0.22 * progress) * (1 + 0.04 * Math.sin(progress * 19)));
    const net = running + priced + realNet;
    snaps.push({
      date: d,
      assetsDefaultMinor: BigInt(Math.max(net, 0) + 40_000),
      liabilitiesDefaultMinor: 40_000n, // typical mid-month card balance
      netDefaultMinor: BigInt(net),
      breakdownJson: "[]",
    });
    snapDates.push(d);
  }
  for (let i = 0; i < snaps.length; i += 300) {
    await prisma.netWorthSnapshot.createMany({ data: snaps.slice(i, i + 300) });
  }
  console.log(`snapshots backfilled: ${snapDates.length}`);

  // ---- record everything for precise cleanup ---------------------------
  await prisma.setting.create({
    data: {
      key: "demo.seed",
      valueJson: JSON.stringify({
        createdAt: new Date().toISOString(),
        accountIds: [nbk, savings, cash, card, wise, nre, eth, aapl].map((a) => a.id),
        budgetIds,
        campaignIds: campaigns.map((c) => c.id),
        horizonIds: horizon.map((h) => h.id),
        snapshotDates: snapDates,
      }),
    },
  });

  console.log("\nDone. Demo dataset live. Remove with: npx tsx scripts/demo-clean.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
