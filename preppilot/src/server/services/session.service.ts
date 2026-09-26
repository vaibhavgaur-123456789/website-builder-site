import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { XP } from "@/config/scoring";
import { dayKey } from "@/lib/engine/dates";
import { completionMessage } from "@/lib/engine/triage";
import { nextPathwayStep } from "@/lib/engine/weakness";
import { consistencyXp, sessionXp, validateSession, type XpAward } from "@/lib/engine/xp";
import { currentStreak } from "@/lib/engine/streaks";
import { parseJson, toJson } from "@/lib/json";
import type { SessionCompleteInput } from "@/lib/validation/schemas";
import { trackEvent } from "./context";
import { awardXp, checkAchievements, xpEarnedToday } from "./gamification.service";
import { recordTopicPractice, refreshWeakness } from "./learning.service";
import { refreshReadiness } from "./readiness.service";
import { completeRevision, scheduleInitialRevision } from "./revision.service";
import { qualifyingDays, recomputeDailyStat } from "./stats.service";

interface StartInput {
  clientId: string;
  taskId?: string | null;
  topicId?: string | null;
  mode: "TIMER" | "STOPWATCH";
  plannedMinutes: number;
  startedAt: Date;
}

/** Start (or resume, idempotently by clientId) a focus session. */
export async function startSession(userId: string, input: StartInput, now = new Date()) {
  const existing = await prisma.studySession.findUnique({ where: { clientId: input.clientId } });
  if (existing) {
    if (existing.userId !== userId) throw notFound("Session");
    return existing;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let topicId = input.topicId ?? null;
  let plannedMinutes = input.plannedMinutes;
  if (input.taskId) {
    const task = await prisma.task.findUnique({ where: { id: input.taskId } });
    if (!task || task.userId !== userId) throw notFound("Task");
    topicId = task.topicId;
    plannedMinutes = plannedMinutes || task.plannedMinutes;
    if (task.status === "PENDING") await prisma.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
  }
  // One active session per student. A forgotten one is closed as abandoned (no XP, but kept for honesty).
  await prisma.studySession.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "ABANDONED", endedAt: now } });
  const startedAt = input.startedAt > now ? now : input.startedAt;
  return prisma.studySession.create({
    data: { clientId: input.clientId, userId, taskId: input.taskId ?? null, topicId, mode: input.mode, plannedMinutes, startedAt, serverStartedAt: now, date: dayKey(startedAt, user.timezone) },
  });
}

export async function activeSession(userId: string) {
  return prisma.studySession.findFirst({ where: { userId, status: "ACTIVE" }, include: { task: true }, orderBy: { startedAt: "desc" } });
}

/** Finish a session: record ACTUAL work separately from the plan, then update everything that depends on it. */
export async function completeSession(userId: string, input: SessionCompleteInput, now = new Date()) {
  let session = await prisma.studySession.findUnique({ where: { clientId: input.clientId } });
  if (!session && input.start) session = await startSession(userId, { clientId: input.clientId, ...input.start, taskId: input.start.taskId ?? null, topicId: input.start.topicId ?? null }, now);
  if (!session || session.userId !== userId) throw notFound("Session");
  if (session.status === "COMPLETED") return { session, xp: [] as XpAward[], flags: parseJson<string[]>(session.flags, []), message: "Already saved.", achievements: [], weakFlagged: [], duplicate: true };
  if (input.questionsCorrect > input.questionsAttempted) throw badRequest("Correct answers can't exceed questions attempted.");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const tz = user.timezone;
  const endedAt = input.endedAt > now ? now : input.endedAt;

  // Overlap check against other completed sessions (anti-gaming: no double-counting parallel timers).
  const others = await prisma.studySession.findMany({ where: { userId, status: "COMPLETED", id: { not: session.id }, endedAt: { gt: session.startedAt }, startedAt: { lt: endedAt } } });
  const overlapSec = others.reduce((s, o) => s + Math.max(0, (Math.min(o.endedAt!.getTime(), endedAt.getTime()) - Math.max(o.startedAt.getTime(), session!.startedAt.getTime())) / 1000), 0);

  const v = validateSession({
    startedAt: session.startedAt,
    serverStartedAt: session.serverStartedAt,
    endedAt,
    now,
    activeSeconds: input.activeSeconds,
    breakSeconds: input.breakSeconds,
    questionsAttempted: input.questionsAttempted,
    questionsCorrect: input.questionsCorrect,
    overlapsAnotherSession: overlapSec > 5 * 60,
  });
  const activeMinutes = Math.floor(v.activeSeconds / 60);

  session = await prisma.studySession.update({
    where: { id: session.id },
    data: {
      endedAt, activeSeconds: v.activeSeconds, breakSeconds: input.breakSeconds, pauseCount: input.pauseCount,
      questionsAttempted: v.questionsAttempted, questionsCorrect: v.questionsCorrect,
      difficultyRating: input.difficultyRating ?? null, focusRating: input.focusRating ?? null, energyRating: input.energyRating ?? null,
      distractionCount: input.distractionCount, completionPct: input.completionPct, notes: input.notes,
      status: "COMPLETED", validated: v.validated, flags: toJson(v.flags),
    },
  });
  const date = session.date;
  const accuracy = v.questionsAttempted > 0 ? v.questionsCorrect / v.questionsAttempted : null;

  // Task: planned stays untouched; actual accumulates.
  const task = session.taskId ? await prisma.task.findUnique({ where: { id: session.taskId } }) : null;
  if (task) {
    const actual = task.actualMinutes + activeMinutes;
    await prisma.task.update({
      where: { id: task.id },
      data: {
        actualMinutes: actual,
        questionsDone: task.questionsDone + v.questionsAttempted,
        questionsCorrect: task.questionsCorrect + v.questionsCorrect,
        completionPct: Math.max(task.completionPct, input.completionPct),
        status: input.completionPct >= 90 ? "DONE" : input.completionPct > 0 || activeMinutes > 0 ? "PARTIAL" : task.status === "IN_PROGRESS" ? "PENDING" : task.status,
        completedAt: input.completionPct >= 90 ? now : null,
      },
    });
    if (task.type === "MOCK_ANALYSIS" && input.completionPct >= 90) {
      await prisma.mockAttempt.updateMany({ where: { userId, status: "SUBMITTED", analyzedAt: null }, data: { analyzedAt: now } });
    }
  }

  // Topic state, revision and weakness pathway.
  let weakFlagged: string[] = [];
  let pathwayMessage: string | null = null;
  const topicId = session.topicId;
  if (topicId) {
    const st = await recordTopicPractice(userId, topicId, { minutes: activeMinutes, attempts: v.questionsAttempted, correct: v.questionsCorrect, markStarted: activeMinutes > 0 }, now);
    const topic = await prisma.topic.findUniqueOrThrow({ where: { id: topicId } });
    if (task?.type === "REVISION") {
      await completeRevision(userId, topicId, { accuracy, recall: input.recall ?? null }, date, task.id);
    } else if (st.status !== "COMPLETED" && (input.topicCompleted || (task?.type === "STUDY" && input.completionPct >= 90 && st.minutesStudied >= topic.estimatedMinutes))) {
      await prisma.userTopicState.update({ where: { id: st.id }, data: { status: "COMPLETED", completedAt: now } });
      await scheduleInitialRevision(userId, topicId, date);
    }
    if (st.recoveryStep > 0 && task && task.topicId === topicId && input.completionPct >= 60) {
      const next = nextPathwayStep(st.recoveryStep, accuracy ?? 0.6);
      await prisma.userTopicState.update({ where: { id: st.id }, data: { recoveryStep: next.step } });
      pathwayMessage = next.message;
      if (st.recoveryStep === 5 && next.step === 0) await trackEvent(userId, "weak_topic_recovered", { topicId });
    }
    if (user.profile) weakFlagged = await refreshWeakness(userId, user.profile.examId, date, [topicId], now);
  }

  // XP: study + questions (capped), then consistency once the day qualifies.
  const earned = await xpEarnedToday(userId, date);
  const awards = sessionXp({ id: session.id, activeMinutes, correct: v.questionsCorrect, validated: v.validated }, earned);
  const stat = await recomputeDailyStat(userId, date, tz);
  if (stat.actualMinutes >= XP.qualifyingDayMinutes) {
    const streak = currentStreak(await qualifyingDays(userId), date).streak;
    awards.push(consistencyXp(date, streak));
  }
  const xp = await awardXp(userId, date, awards);
  const achievements = await checkAchievements(userId, date);
  if (user.profile) await refreshReadiness(userId, now);
  await trackEvent(userId, "session_complete", { minutes: activeMinutes, validated: v.validated });

  const planned = stat.plannedMinutes;
  const message = planned > 0 ? completionMessage((stat.actualMinutes / planned) * 100) : `${activeMinutes} focused minutes logged.`;
  return { session, xp, flags: v.flags, message, achievements, weakFlagged, pathwayMessage, duplicate: false };
}

export async function abandonSession(userId: string, clientId: string) {
  const s = await prisma.studySession.findUnique({ where: { clientId } });
  if (!s || s.userId !== userId) throw notFound("Session");
  if (s.status !== "ACTIVE") return s;
  if (s.taskId) await prisma.task.updateMany({ where: { id: s.taskId, status: "IN_PROGRESS" }, data: { status: "PENDING" } });
  return prisma.studySession.update({ where: { id: s.id }, data: { status: "ABANDONED", endedAt: new Date() } });
}
