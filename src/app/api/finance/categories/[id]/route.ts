import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serialize";

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  icon: z.string().max(30).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, icon, archived } = parsed.data;
  const category = await prisma.category.update({
    where: { id },
    data: {
      name,
      icon,
      archivedAt: archived === undefined ? undefined : archived ? new Date() : null,
    },
  });
  return NextResponse.json(jsonSafe(category));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const used = await prisma.transaction.count({ where: { categoryId: id } });
  if (used > 0) {
    // categories with history are archived, never destroyed
    await prisma.category.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ archived: true, transactions: used });
  }
  await prisma.budget.deleteMany({ where: { categoryId: id } });
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
