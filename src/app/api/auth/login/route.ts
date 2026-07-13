import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 400 });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));

  // constant-time compare
  const a = String(password ?? "");
  let diff = a.length === expected.length ? 0 : 1;
  for (let i = 0; i < Math.min(a.length, expected.length); i++) {
    diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET || expected;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
