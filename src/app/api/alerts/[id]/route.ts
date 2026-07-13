import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Dismiss an alert (or all, with id = "all"). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === "all") {
    await prisma.alert.updateMany({
      where: { dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
  } else {
    await prisma.alert.update({ where: { id }, data: { dismissedAt: new Date() } });
  }
  return NextResponse.json({ dismissed: true });
}
