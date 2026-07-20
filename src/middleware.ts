import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "@/lib/auth";

/**
 * Locks the whole app behind the session cookie when APP_PASSWORD is set.
 * Public: /login, /api/auth/* (the door itself), /api/cron/* (bearer-guarded
 * separately — Vercel Cron has no cookie).
 */
export async function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next(); // auth disabled (local dev)

  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // everything except Next internals and public PWA assets
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)",
  ],
};
