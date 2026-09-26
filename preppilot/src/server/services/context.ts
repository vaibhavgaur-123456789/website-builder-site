import { prisma } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import { dayKey } from "@/lib/engine/dates";
import { parseJson } from "@/lib/json";
import type { Slot } from "@/lib/engine/planner";

export async function getStudentContext(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: { include: { exam: true } } } });
  if (!user) throw notFound("User");
  if (!user.profile) throw new AppError(409, "ONBOARDING_REQUIRED", "Finish onboarding first.");
  const tz = user.timezone;
  return {
    user,
    profile: user.profile,
    exam: user.profile.exam,
    tz,
    today: dayKey(now, tz),
    slots: parseJson<Slot[]>(user.profile.preferredSlots, ["MORNING", "EVENING"]),
  };
}
export type StudentContext = Awaited<ReturnType<typeof getStudentContext>>;

export async function trackEvent(userId: string | null, name: string, props: Record<string, unknown> = {}, now = new Date()) {
  try {
    await prisma.productEvent.create({ data: { userId, name, props: JSON.stringify(props), date: now.toISOString().slice(0, 10) } });
  } catch {
    // analytics must never break a user action
  }
}
