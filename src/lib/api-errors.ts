import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AmountError } from "./money";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Route-handler wrapper: maps known failure classes to honest status codes
 * instead of leaking them as raw 500s. Everything unexpected is logged with
 * the route path (Vercel captures function logs) and returned as a generic 500.
 */
export function withErrors<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AmountError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2003") {
          return NextResponse.json(
            { error: "A referenced record does not exist" },
            { status: 400 },
          );
        }
        if (e.code === "P2025") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (e.code === "P2002") {
          return NextResponse.json({ error: "Already exists" }, { status: 409 });
        }
      }
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
