import { prisma } from "@/server/db";
import { CONFIG_VERSION } from "@/config/scoring";
import { addDays, dayKey, diffDays } from "@/lib/engine/dates";
import { computeReadiness, type ReadinessResult } from "@/lib/engine/readiness";
import { parseJson } from "@/lib/json";
import { leafTopics } from "./learning.service";
import { revisionHealth } from "./revision.service";

export async function syllabusCoverage(userId: string, examId: string) {
  const [topics, states] = await Promise.all([leafTopics(examId), prisma.userTopicState.findMany({ where: { userId }, select: { topicId: true, status: true } })]);
  const by = new Map(states.map((s) => [s.topicId, s.status]));
  let total = 0;
  let done = 0;
  let completed = 0;
  for (const t of topics) {
    total += t.weightage;
    const s = by.get(t.id);
    if (s === "COMPLETED") {
      done += t.weightage;
      completed++;
    } else if (s === "IN_PROGRESS") done += t.weightage * 0.5;
  }
  return { coverage: total > 0 ? done / total : 0, totalUnits: total, doneUnits: done, topicsTotal: topics.length, topicsCompleted: completed };
}

/** Compute readiness from measured data and store today's snapshot. */
export async function refreshReadiness(userId: string, now = new Date()): Promise<ReadinessResult & { date: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const profile = user.profile!;
  const today = dayKey(now, user.timezone);

  const [cov, mocks, stats30, rev, allStats, totalMocks] = await Promise.all([
    syllabusCoverage(userId, profile.examId),
    prisma.mockAttempt.findMany({ where: { userId, status: "SUBMITTED", mock: { type: { in: ["FULL", "SECTIONAL"] } } }, orderBy: { submittedAt: "asc" }, select: { percent: true } }),
    prisma.dailyStat.findMany({ where: { userId, date: { gte: addDays(today, -29), lte: today } } }),
    revisionHealth(userId, today),
    prisma.dailyStat.aggregate({ where: { userId }, _sum: { questions: true } }),
    prisma.mockAttempt.count({ where: { userId, status: "SUBMITTED" } }),
  ]);

  const attempts30 = stats30.reduce((s, d) => s + d.questions, 0);
  const correct30 = stats30.reduce((s, d) => s + d.correct, 0);
  const activeDays14 = stats30.filter((d) => d.date >= addDays(today, -13) && d.actualMinutes >= 25).length;
  const totalActiveDays = await prisma.dailyStat.count({ where: { userId, actualMinutes: { gte: 25 } } });
  const weeklyAccuracy = [3, 2, 1, 0].map((w) => {
    const from = addDays(today, -(w * 7 + 6));
    const to = addDays(today, -w * 7);
    const days = stats30.filter((d) => d.date >= from && d.date <= to);
    const q = days.reduce((s, d) => s + d.questions, 0);
    return q >= 10 ? days.reduce((s, d) => s + d.correct, 0) / q : null;
  });

  const result = computeReadiness({
    coverage: cov.coverage,
    mockPercents: mocks.map((m) => m.percent ?? 0),
    attempts30,
    correct30,
    revisionsDue30: rev.due,
    revisionsOnTime30: rev.onTime,
    activeDays14,
    daysSinceStart: Math.max(0, diffDays(dayKey(profile.createdAt, user.timezone), today)),
    weeklyAccuracy,
    totalMocks,
    totalQuestions: allStats._sum.questions ?? 0,
    totalActiveDays,
  });

  const components = Object.fromEntries(result.components.map((c) => [c.key, c.value]));
  await prisma.readinessSnapshot.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, score: result.score, components: JSON.stringify(components), confidence: result.confidence, configVersion: CONFIG_VERSION },
    update: { score: result.score, components: JSON.stringify(components), confidence: result.confidence, configVersion: CONFIG_VERSION },
  });
  return { ...result, date: today };
}

export async function readinessHistory(userId: string, days = 60) {
  const rows = await prisma.readinessSnapshot.findMany({ where: { userId }, orderBy: { date: "desc" }, take: days });
  return rows.reverse().map((r) => ({ date: r.date, score: r.score, confidence: r.confidence, components: parseJson<Record<string, number | null>>(r.components, {}) }));
}
