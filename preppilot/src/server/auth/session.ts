import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/server/db";

export const SESSION_COOKIE = "pp_session";
export const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters (see .env.example).");
  return new TextEncoder().encode(s);
}

/** Create a DB-backed session and return the signed token for the cookie. */
export async function createSession(userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const row = await prisma.authSession.create({ data: { userId, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null } });
  const token = await new SignJWT({ sid: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt };
}

/** Signature + expiry check only (cheap; used by proxy.ts for redirects). */
export async function verifyToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

/** Full check: signature, DB row exists (not revoked), not expired. Returns the user. */
export async function resolveSession(token: string | undefined | null) {
  const sid = await verifyToken(token);
  if (!sid) return null;
  const session = await prisma.authSession.findUnique({ where: { id: sid }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return { sessionId: session.id, user: session.user };
}

export async function destroySession(token: string | undefined | null) {
  const sid = await verifyToken(token);
  if (sid) await prisma.authSession.deleteMany({ where: { id: sid } });
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
