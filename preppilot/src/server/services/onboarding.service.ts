import { prisma } from "@/server/db";
import { badRequest } from "@/server/errors";
import { REVISION } from "@/config/scoring";
import { addDays, dayKey, diffDays } from "@/lib/engine/dates";
import { cascadeGoals } from "@/lib/engine/goals";
import { toJson } from "@/lib/json";
import type { OnboardingInput } from "@/lib/validation/schemas";
import { trackEvent } from "./context";
import { leafTopics } from "./learning.service";
import { ensureDayPlan } from "./planner.service";
import { refreshReadiness } from "./readiness.service";

export async function listExams() {
  const exams = await prisma.exam.findMany({
    where: { isActive: true },
    include: { sections: { orderBy: { order: "asc" } }, subjects: { orderBy: { order: "asc" }, include: { topics: { orderBy: { order: "asc" }, include: { _count: { select: { children: true } } } } } } },
    orderBy: { name: "asc" },
  });
  return exams.map((e) => ({
    id: e.id,
    name: e.name,
    shortName: e.shortName,
    category: e.category,
    description: e.description,
    durationMinutes: e.durationMinutes,
    totalQuestions: e.totalQuestions,
    negativeMarking: e.negativeMarking,
    marksPerQuestion: e.marksPerQuestion,
    subjects: e.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      topics: s.topics.filter((t) => t._count.children === 0).map((t) => ({ id: t.id, name: t.name, weightage: t.weightage, parentId: t.parentId })),
    })),
  }));
}

export interface Baseline {
  daysLeft: number;
  topicsTotal: number;
  topicsCompleted: number;
  topicsInProgress: number;
  coveragePct: number;
  remainingStudyHours: number;
  recommendedDailyMinutes: number;
  availableDailyMinutes: number;
  feasibility: "COMFORTABLE" | "TIGHT" | "STRETCHED";
  feasibilityNote: string;
  subjectDistribution: { subjectId: string; subject: string; sharePct: number; minutesPerWeek: number; selfReported: "WEAK" | "STRONG" | null }[];
  weakSubjectIds: string[];
  strongSubjectIds: string[];
  selfReportedMockAvg: number | null;
  revisionScheduled: number;
}

/** Turn onboarding answers into a measurable starting point, a first plan and a revision schedule. */
export async function completeOnboarding(userId: string, input: OnboardingInput, now = new Date()) {
  const exam = await prisma.exam.findUnique({ where: { id: input.examId } });
  if (!exam || !exam.isActive) throw badRequest("Please choose an exam from the list.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const timezone = input.timezone ?? user.timezone;
  const today = dayKey(now, timezone);
  const daysLeft = diffDays(today, input.examDate);
  if (daysLeft < 1) throw badRequest("The exam date must be in the future.");
  if (daysLeft > 3 * 365) throw badRequest("Please choose an exam date within the next 3 years.");

  const leaves = await leafTopics(exam.id);
  const leafIds = new Set(leaves.map((t) => t.id));
  const completed = [...new Set(input.completedTopicIds)].filter((id) => leafIds.has(id));
  const inProgress = [...new Set(input.inProgressTopicIds)].filter((id) => leafIds.has(id) && !completed.includes(id));
  const subjectIds = new Set(leaves.map((t) => t.subjectId));
  const weak = input.weakSubjectIds.filter((id) => subjectIds.has(id));
  const strong = input.strongSubjectIds.filter((id) => subjectIds.has(id) && !weak.includes(id));

  // Capacity and the recommended hours.
  const remainingMinutes = leaves.reduce((s, t) => s + (completed.includes(t.id) ? 0 : inProgress.includes(t.id) ? t.estimatedMinutes * 0.6 : t.estimatedMinutes), 0);
  const practiceFactor = 1.6; // first-pass study + practice + revision
  const learningDays = Math.max(1, Math.floor(daysLeft * 0.85));
  const recommendedDailyMinutes = Math.min(600, Math.max(60, Math.round((remainingMinutes * practiceFactor) / learningDays / 15) * 15));
  const ratio = input.dailyMinutes / recommendedDailyMinutes;
  const feasibility: Baseline["feasibility"] = ratio >= 1 ? "COMFORTABLE" : ratio >= 0.75 ? "TIGHT" : "STRETCHED";
  const feasibilityNote =
    feasibility === "COMFORTABLE"
      ? "Your available time covers the remaining syllabus with room for revision and mocks."
      : feasibility === "TIGHT"
        ? "Your time is slightly below what the full syllabus needs. The planner will prioritise high-weightage and weak topics."
        : "Your available time is well below what the full syllabus needs. The planner will focus on the highest-value topics first. Consider adding time if you can.";

  // Weekly minutes per subject: remaining work × weightage, nudged by self-reported weakness.
  const bySubject = new Map<string, { name: string; weight: number }>();
  for (const t of leaves) {
    const remaining = completed.includes(t.id) ? 0.2 : inProgress.includes(t.id) ? 0.6 : 1;
    const nudge = weak.includes(t.subjectId) ? 1.25 : strong.includes(t.subjectId) ? 0.85 : 1;
    const cur = bySubject.get(t.subjectId) ?? { name: t.subject.name, weight: 0 };
    cur.weight += t.weightage * remaining * nudge;
    bySubject.set(t.subjectId, cur);
  }
  const totalW = [...bySubject.values()].reduce((s, x) => s + x.weight, 0) || 1;
  const weekly = input.weeklyGoalMinutes ?? input.dailyMinutes * 7;
  const subjectDistribution = [...bySubject.entries()].map(([id, x]) => ({
    subjectId: id,
    subject: x.name,
    sharePct: Math.round((x.weight / totalW) * 100),
    minutesPerWeek: Math.round(((x.weight / totalW) * weekly) / 5) * 5,
    selfReported: (weak.includes(id) ? "WEAK" : strong.includes(id) ? "STRONG" : null) as "WEAK" | "STRONG" | null,
  }));

  const baseline: Baseline = {
    daysLeft,
    topicsTotal: leaves.length,
    topicsCompleted: completed.length,
    topicsInProgress: inProgress.length,
    coveragePct: 0,
    remainingStudyHours: Math.round(remainingMinutes / 60),
    recommendedDailyMinutes,
    availableDailyMinutes: input.dailyMinutes,
    feasibility,
    feasibilityNote,
    subjectDistribution,
    weakSubjectIds: weak,
    strongSubjectIds: strong,
    selfReportedMockAvg: input.previousMockScores.length ? Math.round(input.previousMockScores.reduce((a, b) => a + b, 0) / input.previousMockScores.length) : null,
    revisionScheduled: completed.length,
  };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { name: input.name, ageRange: input.ageRange ?? null, language: input.language, benchmarkOptIn: input.benchmarkOptIn, timezone, onboardedAt: now } });
    const profileData = {
      examId: exam.id,
      examDate: input.examDate,
      targetScore: input.targetScore ?? null,
      targetRank: input.targetRank ?? null,
      prepLevel: input.prepLevel,
      dailyMinutes: input.dailyMinutes,
      preferredSlots: toJson(input.preferredSlots),
      dailyGoalMinutes: input.dailyGoalMinutes ?? input.dailyMinutes,
      weeklyGoalMinutes: weekly,
      previousMockScores: toJson(input.previousMockScores),
      baseline: toJson(baseline),
    };
    await tx.studentProfile.upsert({ where: { userId }, create: { userId, ...profileData }, update: profileData });
    await tx.notificationPrefs.upsert({ where: { userId }, create: { userId, enabled: input.notifications }, update: { enabled: input.notifications } });

    // Topics already covered: spread their first revision over the next week so day 1 isn't a revision flood.
    for (const [i, topicId] of completed.entries()) {
      const offset = 1 + (i % 7);
      const next = addDays(today, offset);
      await tx.userTopicState.upsert({
        where: { userId_topicId: { userId, topicId } },
        create: { userId, topicId, status: "COMPLETED", completedAt: now, srsStage: 1, intervalDays: REVISION.intervals[1], nextRevisionOn: next },
        update: { status: "COMPLETED", completedAt: now, srsStage: 1, intervalDays: REVISION.intervals[1], nextRevisionOn: next },
      });
      await tx.revisionEvent.create({ data: { userId, topicId, scheduledOn: next, stage: 1 } });
    }
    for (const topicId of inProgress) {
      const t = leaves.find((l) => l.id === topicId)!;
      await tx.userTopicState.upsert({
        where: { userId_topicId: { userId, topicId } },
        create: { userId, topicId, status: "IN_PROGRESS", minutesStudied: Math.round(t.estimatedMinutes * 0.4) },
        update: { status: "IN_PROGRESS" },
      });
    }

    // Goal cascade: exam → month → week → day.
    await tx.goal.deleteMany({ where: { userId, autoCreated: true } });
    const drafts = cascadeGoals({ today, examDate: input.examDate, dailyGoalMinutes: input.dailyGoalMinutes ?? input.dailyMinutes, weeklyGoalMinutes: weekly, topicsRemaining: leaves.length - completed.length });
    let parentId: string | null = null;
    for (const d of drafts) {
      const g: { id: string } = await tx.goal.create({ data: { userId, ...d, parentId: d.level === "EXAM" ? null : parentId, autoCreated: true } });
      if (d.level !== "DAILY") parentId = g.id;
    }
  });

  const readiness = await refreshReadiness(userId, now);
  baseline.coveragePct = readiness.components.find((c) => c.key === "coverage")?.value ?? 0;
  await prisma.studentProfile.update({ where: { userId }, data: { baseline: toJson(baseline) } });
  const plan = await ensureDayPlan(userId, { now, force: true });
  await trackEvent(userId, "onboarding_complete", { exam: exam.slug, daysLeft });
  return { baseline, readiness, plan };
}
