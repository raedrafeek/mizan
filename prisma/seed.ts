import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const currencies = [
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", exponent: 3, isFiat: true },
  { code: "USD", name: "US Dollar", symbol: "$", exponent: 2, isFiat: true },
  { code: "EUR", name: "Euro", symbol: "€", exponent: 2, isFiat: true },
  { code: "INR", name: "Indian Rupee", symbol: "₹", exponent: 2, isFiat: true },
  { code: "GBP", name: "British Pound", symbol: "£", exponent: 2, isFiat: true },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", exponent: 2, isFiat: true },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", exponent: 2, isFiat: true },
  { code: "BTC", name: "Bitcoin", symbol: "₿", exponent: 8, isFiat: false },
  { code: "ETH", name: "Ethereum", symbol: "Ξ", exponent: 8, isFiat: false },
];

const expenseCategories = [
  { name: "Groceries", icon: "groceries" },
  { name: "Housing", icon: "housing" },
  { name: "Transportation", icon: "transport" },
  { name: "Health", icon: "health" },
  { name: "Dining & Entertainment", icon: "dining" },
  { name: "Financial", icon: "financial" },
  { name: "Other", icon: "other" },
];

const incomeCategories = [
  { name: "Salary", icon: "salary" },
  { name: "Bonus", icon: "bonus" },
  { name: "Project / Side income", icon: "project" },
  { name: "Other income", icon: "other" },
];

async function main() {
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  const existing = await prisma.category.count();
  if (existing === 0) {
    let i = 0;
    for (const c of expenseCategories) {
      await prisma.category.create({
        data: { ...c, type: "expense", module: "finance", sortOrder: i++ },
      });
    }
    i = 0;
    for (const c of incomeCategories) {
      await prisma.category.create({
        data: { ...c, type: "income", module: "finance", sortOrder: i++ },
      });
    }
  }

  await prisma.setting.upsert({
    where: { key: "defaultCurrency" },
    update: {},
    create: { key: "defaultCurrency", valueJson: JSON.stringify("KWD") },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
