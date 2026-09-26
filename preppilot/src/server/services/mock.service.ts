import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { addDays, dayKey } from "@/lib/engine/dates";
import { categorizeMistake } from "@/lib/engine/mistakes";
import { scoreMock, type MockAnswer, type MockResult } from "@/lib/engine/mockScoring";
import { mockXp } from "@/lib/engine/xp";
import { parseJson, toJson } from "@/lib/json";
import { getStudentContext, trackEvent } from "./context";
import { awardXp, checkAchievements } from "./gamification.service";
import { loadTopicInsights, recordTopicPractice, refreshWeakness } from "./learning.service";
import { refreshReadiness } from "./readiness.service";
import { recomputeDailyStat } from "./stats.service";

export async function listMocks(userId: string) {
  const ctx = await getStudentContext(userId);
  const mocks = await prisma.mock.findMany({
    where: { examId: ctx.exam.id, isPublished: true, OR: [{ createdById: null }, { createdById: userId }] },
    include: { _count: { select: { questions: true } }, attempts: { where: { userId }, orderBy: { startedAt: "desc" } } },
    orderBy: [{ type: "asc" }, { title: "asc" }],
  });
  return mocks.map((m) => ({
    id: m.id,
    title: m.title,
    type: m.type,
    durationMinutes: m.durationMinutes,
    questionCount: m._count.questions,
    custom: m.createdById !== null,
    inProgress: m.attempts.find((a) => a.status === "IN_PROGRESS")?.id ?? null,
    attempts: m.attempts.filter((a) => a.status === "SUBMITTED").map((a) => ({ id: a.id, percent: a.percent, submittedAt: a.submittedAt, accuracy: a.accuracy })),
  }));
}

/** Start or resume an attempt. Returns questions WITHOUT answers or explanations. */
export async function startAttempt(userId: string, mockId: string, now = new Date()) {
  const ctx = await getStudentContext(userId, now);
  const mock = await prisma.mock.findUnique({ where: { id: mockId } });
  if (!mock || mock.examId !== ctx.exam.id || (mock.createdById && mock.createdById !== userId) || !mock.isPublished) throw notFound("Test");
  const open = await prisma.mockAttempt.findFirst({ where: { userId, mockId, status: "IN_PROGRESS" } });
  const attempt = open ?? (await prisma.mockAttempt.create({ data: { userId, mockId, startedAt: now } }));
  if (!open) await trackEvent(userId, "mock_start", { type: mock.type });
  return getAttemptForPlayer(userId, attempt.id);
}

export async function getAttemptForPlayer(userId: string, attemptId: string) {
  const attempt = await prisma.mockAttempt.findUnique({
    where: { id: attemptId },
    include: { mock: { include: { questions: { include: { question: { include: { topic: { include: { subject: true } } } } }, orderBy: { order: "asc" } } } } },
  });
  if (!attempt || attempt.userId !== userId) throw notFound("Attempt");
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    mock: { id: attempt.mock.id, title: attempt.mock.title, type: attempt.mock.type, durationMinutes: attempt.mock.durationMinutes },
    deadline: new Date(attempt.startedAt.getTime() + attempt.mock.durationMinutes * 60_000),
    answers: parseJson<Record<string, MockAnswer>>(attempt.answers, {}),
    questions: attempt.mock.questions.map((mq) => ({
      id: mq.question.id,
      stem: mq.question.stem,
      options: parseJson<string[]>(mq.question.options, []),
      subject: mq.question.topic.subject.name,
      topic: mq.question.topic.name,
      marks: mq.marks,
    })),
  };
}

/** Autosave answers while the test is running (merge; offline-safe to retry). */
export async function saveAnswers(userId: string, attemptId: string, answers: Record<string, MockAnswer>) {
  const attempt = await prisma.mockAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) throw notFound("Attempt");
  if (attempt.status !== "IN_PROGRESS") throw badRequest("This test was already submitted.");
  const merged = { ...parseJson<Record<string, MockAnswer>>(attempt.answers, {}), ...answers };
  await prisma.mockAttempt.update({ where: { id: attemptId }, data: { answers: toJson(merged) } });
  return { saved: Object.keys(answers).length };
}

/** Score on the server, write per-question analytics and mistakes, then update everything downstream. */
export async function submitAttempt(userId: string, attemptId: string, finalAnswers: Record<string, MockAnswer> = {}, now = new Date()) {
  const attempt = await prisma.mockAttempt.findUnique({
    where: { id: attemptId },
    include: { mock: { include: { exam: true, questions: { include: { question: { include: { topic: { include: { subject: true } } } } } } } } },
  });
  if (!attempt || attempt.userId !== userId) throw notFound("Attempt");
  if (attempt.status === "SUBMITTED") return getResult(userId, attemptId);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const answers = { ...parseJson<Record<string, MockAnswer>>(attempt.answers, {}), ...finalAnswers };
  const { mock } = attempt;
  const qInfo = mock.questions.map((mq) => ({
    questionId: mq.questionId,
    topicId: mq.question.topicId,
    topicName: mq.question.topic.name,
    subjectId: mq.question.topic.subjectId,
    subjectName: mq.question.topic.subject.name,
    correctIndex: mq.question.correctIndex,
    marks: mq.marks,
    expectedSeconds: mq.question.expectedSeconds,
    difficulty: mq.question.difficulty,
  }));
  const negativeRatio = mock.exam.marksPerQuestion > 0 ? mock.exam.negativeMarking / mock.exam.marksPerQuestion : 0;
  const result = scoreMock(qInfo, answers, negativeRatio);

  // Time taken is measured by the server, capped at the duration plus a small grace period.
  const elapsed = Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000);
  const timeTakenSec = Math.max(0, Math.min(elapsed, mock.durationMinutes * 60 + 60));
  const date = dayKey(now, user.timezone);

  const subjectFlags = new Map(mock.questions.map((mq) => [mq.questionId, mq.question.topic.subject]));
  await prisma.$transaction(async (tx) => {
    await tx.mockAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SUBMITTED", submittedAt: now, answers: toJson(answers), score: result.score, maxScore: result.maxScore, percent: result.percent,
        correct: result.correct, wrong: result.wrong, skipped: result.skipped, accuracy: result.accuracy, attemptRate: result.attemptRate, timeTakenSec,
        analysis: toJson({ ...result, questions: undefined }),
        analyzedAt: mock.type === "DIAGNOSTIC" || mock.type === "TOPIC" || mock.type === "CUSTOM" ? now : null,
      },
    });
    for (const q of result.questions) {
      const qa = await tx.questionAttempt.create({
        data: { userId, questionId: q.questionId, topicId: q.topicId, mockAttemptId: attemptId, selectedIndex: q.selected, isCorrect: q.isCorrect, decision: q.skipped ? "SKIPPED" : "ATTEMPTED", timeSpentSec: q.timeSpentSec, confidence: q.confidence, createdAt: now },
      });
      if (!q.skipped && !q.isCorrect) {
        const subject = subjectFlags.get(q.questionId)!;
        const cat = categorizeMistake({ timeSpentSec: q.timeSpentSec, expectedSeconds: q.expectedSeconds, confidence: q.confidence, isQuantitative: subject.isQuantitative, isMemoryBased: subject.isMemoryBased });
        await tx.mistake.create({ data: { userId, questionAttemptId: qa.id, questionId: q.questionId, topicId: q.topicId, category: cat, autoCategory: cat, nextReviewOn: addDays(date, 1), createdAt: now } });
      }
    }
  });

  // Topic evidence.
  const perTopic = new Map<string, { a: number; c: number }>();
  for (const q of result.questions) {
    if (q.skipped) continue;
    const t = perTopic.get(q.topicId) ?? { a: 0, c: 0 };
    t.a++;
    if (q.isCorrect) t.c++;
    perTopic.set(q.topicId, t);
  }
  for (const [topicId, t] of perTopic) await recordTopicPractice(userId, topicId, { attempts: t.a, correct: t.c }, now);

  const weakFlagged = user.profile ? await refreshWeakness(userId, user.profile.examId, date, [...perTopic.keys()], now) : [];
  await prisma.task.updateMany({ where: { userId, date, type: "MOCK", mockId: mock.id }, data: { status: "DONE", completionPct: 100, actualMinutes: Math.round(timeTakenSec / 60), completedAt: now } });

  const award = mockXp({ attemptId, type: mock.type, attemptRate: result.attemptRate, timeTakenSec, durationSec: mock.durationMinutes * 60, attempted: result.attempted });
  const xp = award ? await awardXp(userId, date, [award]) : [];
  await recomputeDailyStat(userId, date, user.timezone);
  const achievements = await checkAchievements(userId, date);
  if (user.profile) await refreshReadiness(userId, now);
  await trackEvent(userId, "mock_submit", { type: mock.type, percent: result.percent });

  const res = await getResult(userId, attemptId);
  return { ...res, xp, achievements, weakFlagged, xpWithheld: award ? null : "No XP: at least 30% of questions must be attempted with a genuine time investment." };
}

export async function getResult(userId: string, attemptId: string) {
  const attempt = await prisma.mockAttempt.findUnique({
    where: { id: attemptId },
    include: {
      mock: { include: { exam: true, questions: { include: { question: { include: { topic: { include: { subject: true } } } } }, orderBy: { order: "asc" } } } },
      questionAttempts: { include: { mistake: true } },
    },
  });
  if (!attempt || attempt.userId !== userId) throw notFound("Attempt");
  if (attempt.status !== "SUBMITTED") throw badRequest("This test hasn't been submitted yet.");
  const analysis = parseJson<Omit<MockResult, "questions">>(attempt.analysis, {} as Omit<MockResult, "questions">);
  const byQ = new Map(attempt.questionAttempts.map((qa) => [qa.questionId, qa]));
  const previous = await prisma.mockAttempt.findFirst({ where: { userId, status: "SUBMITTED", mock: { type: attempt.mock.type }, submittedAt: { lt: attempt.submittedAt! } }, orderBy: { submittedAt: "desc" } });
  return {
    id: attempt.id,
    mock: { id: attempt.mock.id, title: attempt.mock.title, type: attempt.mock.type, durationMinutes: attempt.mock.durationMinutes, negativeMarking: attempt.mock.exam.negativeMarking },
    submittedAt: attempt.submittedAt,
    analyzedAt: attempt.analyzedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percent: attempt.percent,
    correct: attempt.correct,
    wrong: attempt.wrong,
    skipped: attempt.skipped,
    accuracy: attempt.accuracy,
    attemptRate: attempt.attemptRate,
    timeTakenSec: attempt.timeTakenSec,
    previousPercent: previous?.percent ?? null,
    analysis,
    questions: attempt.mock.questions.map((mq) => {
      const qa = byQ.get(mq.questionId);
      return {
        id: mq.questionId,
        stem: mq.question.stem,
        options: parseJson<string[]>(mq.question.options, []),
        correctIndex: mq.question.correctIndex,
        explanation: mq.question.explanation,
        subject: mq.question.topic.subject.name,
        topic: mq.question.topic.name,
        selected: qa?.selectedIndex ?? null,
        isCorrect: qa?.isCorrect ?? false,
        skipped: qa ? qa.decision === "SKIPPED" : true,
        timeSpentSec: qa?.timeSpentSec ?? 0,
        expectedSeconds: mq.question.expectedSeconds,
        confidence: qa?.confidence ?? null,
        mistakeId: qa?.mistake?.id ?? null,
        mistakeCategory: qa?.mistake?.category ?? null,
      };
    }),
  };
}

export async function markAnalyzed(userId: string, attemptId: string) {
  const a = await prisma.mockAttempt.findUnique({ where: { id: attemptId } });
  if (!a || a.userId !== userId) throw notFound("Attempt");
  await prisma.mockAttempt.update({ where: { id: attemptId }, data: { analyzedAt: a.analyzedAt ?? new Date() } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dayKey(new Date(), user.timezone);
  await prisma.task.updateMany({ where: { userId, date: today, type: "MOCK_ANALYSIS", status: { in: ["PENDING", "IN_PROGRESS", "PARTIAL"] } }, data: { status: "DONE", completionPct: 100, completedAt: new Date() } });
  await recomputeDailyStat(userId, today, user.timezone);
}

/** Build a custom test. Focus: weak topics, unseen questions, or past mistakes. */
export async function createCustomMock(userId: string, input: { title?: string; subjectIds: string[]; topicIds: string[]; count: number; durationMinutes: number; focus: "MIXED" | "WEAK" | "UNSEEN" | "MISTAKES" }, now = new Date()) {
  const ctx = await getStudentContext(userId, now);
  let topicIds = input.topicIds;
  if (input.focus === "WEAK") {
    const insights = await loadTopicInsights(userId, ctx.exam.id, ctx.today, now);
    topicIds = insights.filter((i) => i.weakness.isWeak || i.signals.recoveryStep > 0).map((i) => i.signals.topicId);
    if (topicIds.length === 0) throw badRequest("No weak topics detected yet. Take a mock or practise first.");
  }
  const where = {
    isActive: true,
    topic: { subject: { examId: ctx.exam.id } },
    ...(topicIds.length ? { topicId: { in: topicIds } } : input.subjectIds.length ? { topic: { subjectId: { in: input.subjectIds }, subject: { examId: ctx.exam.id } } } : {}),
  };
  let pool = await prisma.question.findMany({ where, select: { id: true, topicId: true } });
  if (input.focus === "MISTAKES") {
    const m = await prisma.mistake.findMany({ where: { userId, resolved: false }, select: { questionId: true } });
    const ids = new Set(m.map((x) => x.questionId));
    pool = pool.filter((q) => ids.has(q.id));
  } else if (input.focus === "UNSEEN" || input.focus === "WEAK" || input.focus === "MIXED") {
    const seen = new Set((await prisma.questionAttempt.findMany({ where: { userId }, select: { questionId: true }, distinct: ["questionId"] })).map((x) => x.questionId));
    const unseen = pool.filter((q) => !seen.has(q.id));
    pool = input.focus === "UNSEEN" ? unseen : [...unseen, ...pool.filter((q) => seen.has(q.id))];
  }
  if (pool.length === 0) throw badRequest("No questions match these filters yet.");
  // Round-robin across topics for balance.
  const byTopic = new Map<string, string[]>();
  for (const q of pool) byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q.id]);
  const lists = [...byTopic.values()];
  const chosen: string[] = [];
  for (let i = 0; chosen.length < input.count && lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && chosen.length < input.count) chosen.push(l[i]);

  const type = topicIds.length === 1 ? "TOPIC" : "CUSTOM";
  let title = input.title;
  if (!title) {
    const one = topicIds.length === 1 ? await prisma.topic.findUnique({ where: { id: topicIds[0] } }) : null;
    title = one ? `Topic test: ${one.name}` : input.focus === "WEAK" ? "Weak-topic practice" : input.focus === "MISTAKES" ? "Mistake re-test" : "Custom practice test";
  }
  const mock = await prisma.mock.create({ data: { examId: ctx.exam.id, title, type, durationMinutes: input.durationMinutes, topicId: topicIds.length === 1 ? topicIds[0] : null, createdById: userId } });
  await prisma.mockQuestion.createMany({ data: chosen.map((questionId, order) => ({ mockId: mock.id, questionId, order, marks: ctx.exam.marksPerQuestion })) });
  return { mockId: mock.id, questionCount: chosen.length, requested: input.count };
}

export async function mockHistory(userId: string, limit = 20) {
  const rows = await prisma.mockAttempt.findMany({ where: { userId, status: "SUBMITTED" }, include: { mock: true }, orderBy: { submittedAt: "asc" }, take: 200 });
  return rows.slice(-limit).map((r) => ({ id: r.id, title: r.mock.title, type: r.mock.type, percent: r.percent ?? 0, accuracy: r.accuracy, attemptRate: r.attemptRate, submittedAt: r.submittedAt! }));
}
