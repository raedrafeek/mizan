import { prisma } from "@/lib/prisma";

export async function getDefaultCurrency(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: "defaultCurrency" } });
  return row ? (JSON.parse(row.valueJson) as string) : "KWD";
}
