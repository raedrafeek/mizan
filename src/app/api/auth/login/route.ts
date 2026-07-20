import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS, sessionSecret } from "@/lib/auth";

// Per-instance brute-force throttle. Serverless memory resets on cold start,
// which is fine — the goal is making online guessing uneconomical, not perfect
// accounting. 10 failures per window locks that IP out until the window rolls.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 400 });
  }

  const ip = clientIp(req);
  const bucket = failures.get(ip);
  if (bucket && bucket.resetAt > Date.now() && bucket.count >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "Too many attempts — try again in a few minutes" },
      { status: 429 },
    );
  }

  const { password } = await req.json().catch(() => ({ password: "" }));

  // constant-time compare
  const a = String(password ?? "");
  let diff = a.length === expected.length ? 0 : 1;
  for (let i = 0; i < Math.min(a.length, expected.length); i++) {
    diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    const b = bucket && bucket.resetAt > Date.now() ? bucket : { count: 0, resetAt: Date.now() + WINDOW_MS };
    b.count++;
    failures.set(ip, b);
    await new Promise((r) => setTimeout(r, 500)); // slow the guessing loop
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  failures.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
