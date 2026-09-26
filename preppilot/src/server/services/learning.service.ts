import { prisma } from "@/server/db";
import { addDays } from "@/lib/engine/dates";
import type { TopicSignals, TopicStatus } from "@/lib/engine/priority";
import { assessWeakness, type WeaknessResult } from "@/lib/engine/weakness";
import { parseJson } from "@/lib/json";

/** Leaf topics (the units that get studied) of an exam, with subject info. */
export async function leafTopics(examId: string) {
  const topics = await prisma.topic.findMany({
    where: { subject: { examId } },
    include: { subject: true, _count: { select: { children: true, questions: true } } },
    orderBy: [{ subject: { order: "asc" } }, { order: "asc" }],
  });
  return topics.filter((t) => t._count.children === 0);
}

interface Window {
  attempts: number;
  correct: number;
}

/** Per-topic attempt counts in the recent (0–13 days) and previous (14–41 days) windows. Mocks + practice sessions. */
export async function topicWindows(userId: string, today: string, now = new Date()) {
  const day = 86_400_000;
  const recentStart = new Date(now.getTime() - 14 * day);
  const prevStart = new Date(now.getTime() - 42 * day);
  const recentKey = addDays(today, -13);
  const prevKey = addDays(today, -41);

  const [qRecent, qRecentC, qPrev, qPrevC, sRecent, sPrev] = await Promise.all([
    prisma.questionAttempt.groupBy({ by: ["topicId"], where: { userId, decision: "ATTEMPTED", createdAt: { gte: recentStart } }, _count: { _all: true } }),
    prisma.questionAttempt.groupBy({ by: ["topicId"], where: { userId, isCorrect: true, createdAt: { gte: recentStart } }, _count: { _all: true } }),
    prisma.questionAttempt.groupBy({ by: ["topicId"], where: { userId, decision: "ATTEMPTED", createdAt: { gte: prevStart, lt: recentStart } }, _count: { _all: true } }),
    prisma.questionAttempt.groupBy({ by: ["topicId"], where: { userId, isCorrect: true, createdAt: { gte: prevStart, lt: recentStart } }, _count: { _all: true } }),
    prisma.studySession.groupBy({ by: ["topicId"], where: { userId, status: "COMPLETED", topicId: { not: null }, date: { gte: recentKey } }, _sum: { questionsAttempted: true, questionsCorrect: true } }),
    prisma.studySession.groupBy({ by: ["topicId"], where: { userId, status: "COMPLETED", topicId: { not: null }, date: { gte: prevKey, lt: recentKey } }, _sum: { questionsAttempted: true, questionsCorrect: true } }),
  ]);

  const recent = new Map<string, Window>();
  const prev = new Map<string, Window>();
  const add = (m: Map<string, Window>, id: string | null, a: number, c: number) => {
    if (!id) return;
    const w = m.get(id) ?? { attempts: 0, correct: 0 };
    w.attempts += a;
    w.correct += c;
    m.set(id, w);
  };
  for (const r of qRecent) add(recent, r.topicId, r._count._all, 0);
  for (const r of qRecentC) add(recent, r.topicId, 0, r._count._all);
  for (const r of qPrev) add(prev, r.topicId, r._count._all, 0);
  for (const r of qPrevC) add(prev, r.topicId, 0, r._count._all);
  for (const r of sRecent) add(recent, r.topicId, r._sum.questionsAttempted ?? 0, r._sum.questionsCorrect ?? 0);
  for (const r of sPrev) add(prev, r.topicId, r._sum.questionsAttempted ?? 0, r._sum.questionsCorrect ?? 0);
  return { recent, prev };
}

export interface TopicInsight {
  signals: TopicSignals;
  weakness: WeaknessResult;
  questionCount: number;
}

/** Everything the planner, weakness engine and analytics need about each topic, in one pass. */
export async function loadTopicInsights(
  userId: string,
  examId: string,
  today: string,
  now = new Date(),
  extras: { subjectDeficits?: Record<string, number>; unfinished?: Record<string, number> } = {},
): Promise<TopicInsight[]> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { baseline: true } });
  const self = parseJson<{ weakSubjectIds?: string[]; strongSubjectIds?: string[] }>(profile?.baseline, {});
  const weakSubjects = new Set(self.weakSubjectIds ?? []);
  const strongSubjects = new Set(self.strongSubjectIds ?? []);
  const [topics, states, windows, mistakes, subjects] = await Promise.all([
    leafTopics(examId),
    prisma.userTopicState.findMany({ where: { userId, topic: { subject: { examId } } } }),
    topicWindows(userId, today, now),
    prisma.mistake.groupBy({ by: ["topicId"], where: { userId, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, _count: { _all: true } }),
    prisma.subject.findMany({ where: { examId }, select: { weightage: true } }),
  ]);
  const maxSubjectWeight = Math.max(1, ...subjects.map((s) => s.weightage));
  const stateBy = new Map(states.map((s) => [s.topicId, s]));
  const mistakeBy = new Map(mistakes.map((m) => [m.topicId, m._count._all]));

  return topics.map((t) => {
    const st = stateBy.get(t.id);
    const r = windows.recent.get(t.id) ?? { attempts: 0, correct: 0 };
    const p = windows.prev.get(t.id) ?? { attempts: 0, correct: 0 };
    const signals: TopicSignals = {
      topicId: t.id,
      topicName: t.name,
      subjectId: t.subjectId,
      subjectName: t.subject.name,
      weightage: t.weightage,
      subjectShare: t.subject.weightage / maxSubjectWeight,
      difficulty: t.difficulty,
      status: (st?.status ?? "NOT_STARTED") as TopicStatus,
      minutesStudied: st?.minutesStudied ?? 0,
      estimatedMinutes: t.estimatedMinutes,
      attempts: st?.attempts ?? 0,
      correct: st?.correct ?? 0,
      recentAttempts: r.attempts,
      recentCorrect: r.correct,
      previousAttempts: p.attempts,
      previousCorrect: p.correct,
      nextRevisionOn: st?.nextRevisionOn ?? null,
      recentMistakes: mistakeBy.get(t.id) ?? 0,
      unfinishedMinutes: extras.unfinished?.[t.id] ?? 0,
      subjectDeficit: extras.subjectDeficits?.[t.subjectId] ?? 0,
      recoveryStep: st?.recoveryStep ?? 0,
      selfReported: weakSubjects.has(t.subjectId) ? "WEAK" : strongSubjects.has(t.subjectId) ? "STRONG" : null,
    };
    const weakness = assessWeakness({ ...signals });
    return { signals, weakness, questionCount: t._count.questions };
  });
}

/** Apply practice evidence (attempts/correct/minutes) to a topic's state. */
export async function recordTopicPractice(userId: string, topicId: string, delta: { minutes?: number; attempts?: number; correct?: number; markStarted?: boolean }, now = new Date()) {
  const existing = await prisma.userTopicState.findUnique({ where: { userId_topicId: { userId, topicId } } });
  const status = existing?.status ?? "NOT_STARTED";
  const nextStatus = delta.markStarted && status === "NOT_STARTED" ? "IN_PROGRESS" : status;
  return prisma.userTopicState.upsert({
    where: { userId_topicId: { userId, topicId } },
    create: { userId, topicId, status: nextStatus, minutesStudied: delta.minutes ?? 0, attempts: delta.attempts ?? 0, correct: delta.correct ?? 0, lastStudiedAt: delta.markStarted ? now : null },
    update: {
      status: nextStatus,
      minutesStudied: { increment: delta.minutes ?? 0 },
      attempts: { increment: delta.attempts ?? 0 },
      correct: { increment: delta.correct ?? 0 },
      ...(delta.markStarted ? { lastStudiedAt: now } : {}),
    },
  });
}

/** Flag newly weak topics (start the recovery pathway) after new evidence arrives. */
export async function refreshWeakness(userId: string, examId: string, today: string, topicIds: string[], now = new Date()) {
  if (topicIds.length === 0) return [];
  const insights = await loadTopicInsights(userId, examId, today, now);
  const flagged: string[] = [];
  for (const i of insights) {
    if (!topicIds.includes(i.signals.topicId)) continue;
    if (i.weakness.isWeak && i.signals.recoveryStep === 0) {
      await prisma.userTopicState.update({ where: { userId_topicId: { userId, topicId: i.signals.topicId } }, data: { recoveryStep: 1, flaggedWeakAt: now } });
      flagged.push(i.signals.topicName);
    }
  }
  return flagged;
}
