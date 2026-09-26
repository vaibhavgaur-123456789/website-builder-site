import { prisma } from "@/server/db";
import { XP } from "@/config/scoring";
import { addDays, dayKey } from "@/lib/engine/dates";
import { computeDailyScore } from "@/lib/engine/scoring";

/** Rebuild the DailyStat snapshot for one day from raw facts (tasks, sessions, mocks). Idempotent. */
export async function recomputeDailyStat(userId: string, date: string, tz: string) {
  const [tasks, sessions, mocks] = await Promise.all([
    prisma.task.findMany({ where: { userId, date } }),
    prisma.studySession.findMany({ where: { userId, date, status: "COMPLETED" } }),
    prisma.mockAttempt.findMany({
      where: { userId, status: "SUBMITTED", submittedAt: { gte: new Date(Date.parse(`${addDays(date, -1)}T00:00:00Z`)), lt: new Date(Date.parse(`${addDays(date, 2)}T00:00:00Z`)) } },
    }),
  ]);
  const dayMocks = mocks.filter((m) => m.submittedAt && dayKey(m.submittedAt, tz) === date);

  const active = tasks.filter((t) => t.status !== "SKIPPED" && !t.isOptional);
  const plannedMinutes = active.reduce((s, t) => s + t.plannedMinutes, 0);
  const sessionMinutes = Math.round(sessions.reduce((s, x) => s + x.activeSeconds, 0) / 60);
  const mockMinutes = Math.round(dayMocks.reduce((s, m) => s + m.timeTakenSec, 0) / 60);
  const actualMinutes = sessionMinutes + mockMinutes;
  const tasksDone = active.filter((t) => t.status === "DONE").length;
  const questions = sessions.reduce((s, x) => s + x.questionsAttempted, 0) + dayMocks.reduce((s, m) => s + m.correct + m.wrong, 0);
  const correct = sessions.reduce((s, x) => s + x.questionsCorrect, 0) + dayMocks.reduce((s, m) => s + m.correct, 0);
  const focusRatings = sessions.map((s) => s.focusRating).filter((x): x is number => x !== null);
  const distractions = sessions.reduce((s, x) => s + x.distractionCount, 0);
  const revTasks = active.filter((t) => t.type === "REVISION");
  const mockTasks = active.filter((t) => t.type === "MOCK");

  const score = computeDailyScore({
    plannedMinutes,
    actualMinutes,
    tasksPlanned: active.length,
    tasksDone,
    focusRatings,
    distractions,
    revisionsDue: revTasks.length,
    revisionsDone: revTasks.filter((t) => t.status === "DONE").length,
    testPlanned: mockTasks.length > 0,
    testDone: dayMocks.length > 0 || mockTasks.some((t) => t.status === "DONE"),
    questions,
    correct,
  });

  const data = {
    plannedMinutes,
    actualMinutes,
    tasksPlanned: active.length,
    tasksDone,
    questions,
    correct,
    revisionsDue: revTasks.length,
    revisionsDone: revTasks.filter((t) => t.status === "DONE").length,
    mocksTaken: dayMocks.length,
    focusAvg: focusRatings.length ? focusRatings.reduce((a, b) => a + b, 0) / focusRatings.length : null,
    distractions,
    executionScore: score.execution,
    focusScore: score.focus,
    revisionScore: score.revision,
    testingScore: score.testing,
    dailyScore: score.daily,
  };
  return prisma.dailyStat.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...data }, update: data });
}

export async function qualifyingDays(userId: string): Promise<Set<string>> {
  const rows = await prisma.dailyStat.findMany({ where: { userId, actualMinutes: { gte: XP.qualifyingDayMinutes } }, select: { date: true } });
  return new Set(rows.map((r) => r.date));
}

export async function statsRange(userId: string, from: string, to: string) {
  return prisma.dailyStat.findMany({ where: { userId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
}
