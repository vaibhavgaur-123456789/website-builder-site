import { prisma, isUniqueViolation } from "@/server/db";
import { AppError, conflict } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { trackEvent } from "./context";

function roleFor(email: string) {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase()) ? "ADMIN" : "USER";
}

export async function signup(input: { name: string; email: string; password: string; timezone?: string }) {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: roleFor(input.email), timezone: input.timezone ?? "Asia/Kolkata", notificationPrefs: { create: {} } },
    });
    await trackEvent(user.id, "signup", { method: "email" });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("An account with this email already exists. Try signing in.");
    throw e;
  }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await trackEvent(user.id, "login", { method: "email" });
  return user;
}

/** Google sign-in: link by verified email or create a password-less account. */
export async function upsertGoogleUser(profile: { sub: string; email: string; name: string; emailVerified: boolean }) {
  if (!profile.emailVerified) throw new AppError(400, "EMAIL_NOT_VERIFIED", "Your Google email isn't verified.");
  const byGoogle = await prisma.user.findUnique({ where: { googleId: profile.sub } });
  if (byGoogle) return byGoogle;
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { googleId: profile.sub } });
  const user = await prisma.user.create({
    data: { email: profile.email.toLowerCase(), name: profile.name || profile.email.split("@")[0], googleId: profile.sub, role: roleFor(profile.email), notificationPrefs: { create: {} } },
  });
  await trackEvent(user.id, "signup", { method: "google" });
  return user;
}
