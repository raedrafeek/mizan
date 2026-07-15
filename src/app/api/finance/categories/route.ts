import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  // ?archived=1 lists archived categories (for the restore UI)
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  const categories = await prisma.category.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json(jsonSafe(categories));
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["expense", "income"]),
  icon: z.string().max(30).default("other"),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const max = await prisma.category.aggregate({
    where: { type: parsed.data.type },
    _max: { sortOrder: true },
  });
  const category = await prisma.category.create({
    data: { ...parsed.data, module: "finance", sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  return NextResponse.json(jsonSafe(category), { status: 201 });
}
