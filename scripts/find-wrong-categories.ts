/** One-off audit: list all categories and any transaction whose category
 * doesn't match its type. Run from mizan/: npx tsx scripts/find-wrong-categories.ts */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] });
  console.log("=== categories ===");
  for (const c of cats) {
    console.log(`${c.type.padEnd(7)} ${c.name}${c.archivedAt ? "  [ARCHIVED]" : ""}  icon=${c.icon}`);
  }

  console.log("\n=== type mismatches (expense txn w/ income cat or vice versa) ===");
  const txns = await prisma.transaction.findMany({
    where: { categoryId: { not: null } },
    include: { category: true, account: { select: { name: true } } },
  });
  let bad = 0;
  for (const t of txns) {
    const expected = t.type === "expense" ? "expense" : t.type === "income" ? "income" : null;
    if (expected && t.category && t.category.type !== expected) {
      bad++;
      console.log(`${t.date} ${t.type} ${t.account.name} "${t.note ?? ""}" -> category "${t.category.name}" (${t.category.type})`);
    }
    if (!expected && t.category) {
      bad++;
      console.log(`${t.date} ${t.type} (transfer/adjustment should have NO category) -> "${t.category.name}"`);
    }
  }
  if (bad === 0) console.log("none found");

  console.log("\n=== category usage counts ===");
  const counts = await prisma.transaction.groupBy({
    by: ["categoryId"],
    _count: true,
  });
  for (const row of counts) {
    const name = cats.find((c) => c.id === row.categoryId)?.name ?? "(no category)";
    console.log(`${String(row._count).padStart(5)}  ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
