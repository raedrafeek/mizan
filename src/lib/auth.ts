/**
 * Single-user session tokens: `<expiryMs>.<hex HMAC-SHA256>`.
 * Web Crypto only — must run in both Edge middleware and Node routes.
 * Auth is enforced only when APP_PASSWORD is set (deployed); local dev
 * without it stays open.
 */

export const SESSION_COOKIE = "mizan_session";
export const SESSION_TTL_MS = 90 * 24 * 3_600_000; // 90 days

/**
 * The password is part of the signing key, so changing APP_PASSWORD (or
 * rotating AUTH_SECRET) immediately revokes every outstanding session —
 * the only revocation path a stateless token can have.
 */
export function sessionSecret(): string {
  return `${process.env.AUTH_SECRET ?? ""}|${process.env.APP_PASSWORD ?? ""}`;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${await hmac(exp, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = await hmac(exp, secret);
  // constant-time compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
