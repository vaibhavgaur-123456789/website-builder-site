import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { CONFIG_VERSION, PLANNER } from "@/config/scoring";
import { addDays, diffDays, dayKey, localMinutes, toHHMM, toMinutes } from "@/lib/engine/dates";
import { adapt, type Blocker } from "@/lib/engine/adaptation";
import { scoreTopic, suggestTaskType } from "@/lib/engine/priority";
import { assignTimes, buildDayPlan, validatePlan, type CarryOver, type PlanCandidate, type TaskType } from "@/lib/engine/planner";
import { computePace } from "@/lib/engine/pace";
import { evaluateRecovery, RECOVERY_MESSAGE } from "@/lib/engine/recovery";
import { triageMissedTask } from "@/lib/engine/triage";
import { parseJson, toJson } from "@/lib/json";
import { getStudentContext, trackEvent, type StudentContext } from "./context";
import { loadTopicInsights } from "./learning.service";
import { syllabusCoverage } from "./readiness.service";
import { recomputeDailyStat } from "./stats.service";

const CARRY_ACTIONS = ["RESCHEDULE", "REDUCE", "POSTPONE", "OPTIONAL"];
const OPEN_STATUSES = ["PENDING", "IN_PROGRESS", "PARTIAL"];

// ───────────────────────── Triage ─────────────────────────

/** Give every unfinished task from the last week an explicit outcome. Nothing is silently deleted. */
export async function triageUnfinished(ctx: StudentContext) {
  const { user, today } = ctx;
  const stale = await prisma.task.findMany({
    where: { userId: user.id, date: { lt: today, gte: addDays(today, -7) }, status: { in: OPEN_STATUSES }, missedAction: null },
    orderBy: [{ priorityScore: "desc" }],
  });
  if (stale.length === 0) return [];
  const todays = await prisma.task.findMany({ where: { userId: user.id, date: today, topicId: { not: null } }, select: { topicId: true } });
  const upcoming = new Set(todays.map((t) => t.topicId!));
  const results = [];
  for (const t of stale) {
    if (t.type === "MOCK_ANALYSIS" || t.type === "MOCK") {
      // Exam simulations and analyses are re-decided by the planner from pace and pending attempts.
      await prisma.task.update({ where: { id: t.id }, data: { status: t.status === "PARTIAL" ? "PARTIAL" : "MISSED", missedAction: "OPTIONAL", missedReason: "Re-planned automatically from your mock schedule.", carryConsumed: true } });
      continue;
    }
    const r = triageMissedTask(
      { type: t.type, topicId: t.topicId, plannedMinutes: t.plannedMinutes, actualMinutes: t.actualMinutes, completionPct: t.completionPct, priorityScore: t.priorityScore, carryCount: t.carryCount },
      { upcomingTopicIds: upcoming },
    );
    let carryOn = addDays(t.date, r.offsetDays);
    if (carryOn < today) carryOn = today;
    await prisma.task.update({
      where: { id: t.id },
      data: { status: t.status === "PARTIAL" ? "PARTIAL" : "MISSED", missedAction: r.action, missedReason: r.reason, carryOn, carryMinutes: r.carryMinutes, carryConsumed: r.carryMinutes === 0 && r.action !== "MERGE" },
    });
    if (t.topicId) upcoming.add(t.topicId);
    results.push({ taskId: t.id, title: t.title, ...r });
  }
  // Very old carries are archived visibly instead of piling up.
  const archived = await prisma.task.updateMany({
    where: { userId: user.id, carryConsumed: false, carryOn: { lt: addDays(today, -14) } },
    data: { carryConsumed: true, missedReason: "Archived after 14 days to keep the plan realistic." },
  });
  if (archived.count > 0) results.push({ taskId: "", title: `${archived.count} old unfinished task(s) archived`, action: "OPTIONAL" as const, reason: "older than 14 days", carryMinutes: 0, offsetDays: 0 });
  return results;
}

// ───────────────────────── Plan generation ─────────────────────────

async function pickMock(userId: string, examId: string, capacity: number, examDuration: number) {
  const wantFull = capacity >= examDuration + PLANNER.mockAnalysisMinutes;
  const type = wantFull ? "FULL" : "SECTIONAL";
  const mocks = await prisma.mock.findMany({
    where: { examId, type, createdById: null, isPublished: true },
    include: { attempts: { where: { userId }, orderBy: { startedAt: "desc" }, take: 1 } },
    orderBy: { title: "asc" },
  });
  const fitting = mocks.filter((m) => m.durationMinutes <= capacity - 20);
  const fresh = fitting.find((m) => m.attempts.length === 0);
  const chosen = fresh ?? fitting.sort((a, b) => (a.attempts[0]?.startedAt.getTime() ?? 0) - (b.attempts[0]?.startedAt.getTime() ?? 0))[0];
  return chosen ?? null;
}

export async function paceFor(ctx: StudentContext, now = new Date()) {
  const { user, profile, today } = ctx;
  const [cov, recentDone, stats14, mocks28, lastMock] = await Promise.all([
    syllabusCoverage(user.id, profile.examId),
    prisma.userTopicState.findMany({ where: { userId: user.id, status: "COMPLETED", completedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, include: { topic: { select: { weightage: true } } } }),
    prisma.dailyStat.aggregate({ where: { userId: user.id, date: { gte: addDays(today, -13), lte: today } }, _sum: { questions: true } }),
    prisma.mockAttempt.count({ where: { userId: user.id, status: "SUBMITTED", submittedAt: { gte: new Date(now.getTime() - 28 * 86_400_000) }, mock: { type: { in: ["FULL", "SECTIONAL"] } } } }),
    prisma.mockAttempt.findFirst({ where: { userId: user.id, status: "SUBMITTED", mock: { type: { in: ["FULL", "SECTIONAL"] } } }, orderBy: { submittedAt: "desc" } }),
  ]);
  return computePace({
    today,
    examDate: profile.examDate,
    totalUnits: cov.totalUnits,
    doneUnits: cov.doneUnits,
    unitsLast14: recentDone.reduce((s, t) => s + t.topic.weightage, 0),
    questionsLast14: stats14._sum.questions ?? 0,
    mocksLast28: mocks28,
    lastMockDate: lastMock?.submittedAt ? dayKey(lastMock.submittedAt, user.timezone) : null,
  });
}

/** Evaluate recovery mode and persist changes. */
async function updateRecovery(ctx: StudentContext, backlogMinutes: number) {
  const { user, profile, today } = ctx;
  const recent = await prisma.dailyStat.findMany({ where: { userId: user.id, date: { gte: addDays(today, -7), lt: today } }, orderBy: { date: "asc" } });
  const planned = recent.filter((d) => d.plannedMinutes > 0);
  const decision = evaluateRecovery({
    days: planned.map((d) => ({ date: d.date, planned: d.plannedMinutes, actual: d.actualMinutes })),
    backlogMinutes,
    dailyCapacity: profile.dailyMinutes,
    currentlyActive: profile.recoveryMode,
    manual: profile.recoveryManual,
    recentAvgActual: planned.length ? planned.reduce((s, d) => s + d.actualMinutes, 0) / planned.length : profile.dailyMinutes,
  });
  if (decision.changed) {
    await prisma.studentProfile.update({ where: { userId: user.id }, data: { recoveryMode: decision.active, recoverySince: decision.active ? today : null, recoveryManual: false } });
    ctx.profile.recoveryMode = decision.active;
    await trackEvent(user.id, decision.active ? "recovery_enter" : "recovery_exit", { reason: decision.reason });
    await prisma.notification.upsert({
      where: { dedupeKey: `${user.id}:SYSTEM:recovery:${today}` },
      create: { userId: user.id, type: "SYSTEM", title: decision.active ? "Recovery mode is on" : "Back on your regular plan", body: decision.active ? `${RECOVERY_MESSAGE} ${decision.reason}` : decision.reason, href: "/plan", dedupeKey: `${user.id}:SYSTEM:recovery:${today}`, scheduledFor: new Date() },
      update: {},
    });
  }
  return decision;
}

export interface EnsurePlanOptions {
  date?: string;
  now?: Date;
  force?: boolean;
}

/** Idempotently produce the plan for a day (default: today). `force` regenerates unstarted auto tasks. */
export async function ensureDayPlan(userId: string, opts: EnsurePlanOptions = {}) {
  const now = opts.now ?? new Date();
  const ctx = await getStudentContext(userId, now);
  const date = opts.date ?? ctx.today;
  if (date < ctx.today) throw badRequest("Past plans can't be generated.");

  const existing = await prisma.planDay.findUnique({ where: { userId_date: { userId, date } } });
  if (existing && !opts.force) return getDayPlan(userId, date);

  if (date === ctx.today) await triageUnfinished(ctx);

  // Keep what the student has touched or created; regenerate the rest.
  let kept: { plannedMinutes: number; topicId: string | null; status: string }[] = [];
  if (existing && opts.force) {
    const removable = await prisma.task.findMany({ where: { userId, date, status: "PENDING", source: { not: "MANUAL" }, actualMinutes: 0 } });
    const carriedFrom = removable.map((t) => t.carriedFromId).filter((x): x is string => !!x);
    await prisma.$transaction([
      prisma.task.updateMany({ where: { id: { in: carriedFrom } }, data: { carryConsumed: false } }),
      prisma.task.deleteMany({ where: { id: { in: removable.map((t) => t.id) } } }),
    ]);
    kept = await prisma.task.findMany({ where: { userId, date, status: { not: "SKIPPED" } }, select: { plannedMinutes: true, topicId: true, status: true } });
  }

  // Carry-overs and backlog.
  const carries = await prisma.task.findMany({ where: { userId, carryConsumed: false, carryOn: { lte: date }, missedAction: { not: null } } });
  const backlogMinutes = carries.filter((c) => c.missedAction !== "OPTIONAL" && c.missedAction !== "MERGE").reduce((s, c) => s + c.carryMinutes, 0);
  const unfinished: Record<string, number> = {};
  for (const c of carries) if (c.missedAction === "MERGE" && c.topicId) unfinished[c.topicId] = (unfinished[c.topicId] ?? 0) + c.carryMinutes;

  const recovery = date === ctx.today ? await updateRecovery(ctx, backlogMinutes) : { active: ctx.profile.recoveryMode, capacityMinutes: ctx.profile.dailyMinutes, reason: "" };

  // Adaptation from the last 7 days of PLAN vs ACTUAL.
  const weekAgo = addDays(date, -7);
  const [stats, pastTasks, subjects] = await Promise.all([
    prisma.dailyStat.findMany({ where: { userId, date: { gte: weekAgo, lt: date } }, orderBy: { date: "asc" } }),
    prisma.task.findMany({ where: { userId, date: { gte: weekAgo, lt: date }, subjectId: { not: null }, status: { not: "SKIPPED" }, isOptional: false } }),
    prisma.subject.findMany({ where: { examId: ctx.exam.id } }),
  ]);
  const subjectAgg = new Map<string, { planned: number; actual: number }>();
  for (const t of pastTasks) {
    const a = subjectAgg.get(t.subjectId!) ?? { planned: 0, actual: 0 };
    a.planned += t.plannedMinutes;
    a.actual += Math.min(t.actualMinutes, t.plannedMinutes);
    subjectAgg.set(t.subjectId!, a);
  }
  const adaptation = adapt({
    days: stats.map((d) => ({ date: d.date, planned: d.plannedMinutes, actual: d.actualMinutes, blocker: (d.blocker as Blocker | null) ?? null })),
    subjects: subjects.filter((s) => subjectAgg.has(s.id)).map((s) => ({ subjectId: s.id, subjectName: s.name, ...subjectAgg.get(s.id)! })),
    dailyMinutes: ctx.profile.dailyMinutes,
    blockMinutes: ctx.profile.preferredBlockMin,
  });

  let capacity = Math.round(ctx.profile.dailyMinutes * adaptation.capacityMultiplier);
  if (recovery.active) capacity = Math.min(capacity, recovery.capacityMinutes);
  capacity = Math.max(0, capacity - kept.reduce((s, t) => s + t.plannedMinutes, 0));

  // Topic priorities with explainable reasons.
  const insights = await loadTopicInsights(userId, ctx.exam.id, date, now, { subjectDeficits: adaptation.subjectDeficits, unfinished });
  const keptTopics = new Set(kept.map((k) => k.topicId).filter(Boolean));
  const candidates: PlanCandidate[] = insights
    .filter((i) => !keptTopics.has(i.signals.topicId))
    .filter((i) => i.signals.status !== "COMPLETED" || i.weakness.isWeak || i.signals.recoveryStep > 0)
    .map((i) => {
      const p = scoreTopic(i.signals, { today: date, examDate: ctx.profile.examDate });
      return {
        topicId: i.signals.topicId,
        topicName: i.signals.topicName,
        subjectId: i.signals.subjectId,
        subjectName: i.signals.subjectName,
        score: p.score,
        reasons: p.reasons,
        taskType: suggestTaskType(i.signals),
        remainingMinutes: Math.max(0, i.signals.estimatedMinutes - i.signals.minutesStudied),
        recoveryStep: i.signals.recoveryStep,
        isWeak: i.weakness.isWeak,
      };
    });

  const revisionsDue = insights
    .filter((i) => i.signals.nextRevisionOn && i.signals.nextRevisionOn <= date && !keptTopics.has(i.signals.topicId))
    .map((i) => ({ topicId: i.signals.topicId, topicName: i.signals.topicName, subjectId: i.signals.subjectId, subjectName: i.signals.subjectName, overdueDays: diffDays(i.signals.nextRevisionOn!, date), stage: 0 }));
  const stages = await prisma.userTopicState.findMany({ where: { userId, topicId: { in: revisionsDue.map((r) => r.topicId) } }, select: { topicId: true, srsStage: true } });
  for (const r of revisionsDue) r.stage = stages.find((s) => s.topicId === r.topicId)?.srsStage ?? 0;

  const carryOvers: CarryOver[] = carries
    .filter((c) => CARRY_ACTIONS.includes(c.missedAction!) && c.carryMinutes > 0 && !(c.topicId && keptTopics.has(c.topicId)))
    .map((c) => ({
      title: c.title,
      type: c.type as TaskType,
      topicId: c.topicId,
      subjectId: c.subjectId,
      minutes: c.carryMinutes,
      questionTarget: c.plannedMinutes > 0 ? Math.round((c.questionTarget * c.carryMinutes) / c.plannedMinutes) : 0,
      objective: c.objective,
      reasons: [c.missedReason ?? ""].filter(Boolean),
      carriedFromId: c.id,
      priority: c.priorityScore,
      optional: c.missedAction === "OPTIONAL",
    }));

  const pace = await paceFor(ctx, now);
  const hasMockToday = kept.length > 0 && (await prisma.task.count({ where: { userId, date, type: "MOCK" } })) > 0;
  const mock = !hasMockToday && pace.mockDueToday && !recovery.active ? await pickMock(userId, ctx.exam.id, capacity, ctx.exam.durationMinutes) : null;
  const pendingAnalysis = await prisma.mockAttempt.findFirst({
    where: { userId, status: "SUBMITTED", analyzedAt: null, mock: { type: { not: "DIAGNOSTIC" } } },
    include: { mock: true },
    orderBy: { submittedAt: "desc" },
  });
  const analysisPlanned = pendingAnalysis ? await prisma.task.count({ where: { userId, date, type: "MOCK_ANALYSIS" } }) : 0;
  const unresolvedMistakes = await prisma.mistake.count({ where: { userId, resolved: false } });

  const scores = candidates.map((c) => c.score).sort((a, b) => b - a);
  const minScore = recovery.active && scores.length > 3 ? scores[Math.floor(scores.length * 0.4)] : 0;

  const out = buildDayPlan({
    capacityMinutes: capacity,
    slots: ctx.slots,
    blockMinutes: adaptation.blockMinutes,
    candidates,
    revisionsDue,
    carryOvers,
    unresolvedMistakes,
    mock: mock ? { mockId: mock.id, title: mock.title, minutes: mock.durationMinutes, reason: `${pace.mocks.required} mock${pace.mocks.required === 1 ? "" : "s"}/week recommended with ${pace.daysLeft} days left` } : null,
    pendingMockAnalysis: pendingAnalysis && !analysisPlanned ? { attemptId: pendingAnalysis.id, title: pendingAnalysis.mock.title } : null,
    mode: recovery.active ? "RECOVERY" : "NORMAL",
    finalPhase: pace.phase === "FINAL",
    minScore,
    easeIn: adaptation.easeIn,
    notBefore: date === ctx.today ? localMinutes(now, ctx.tz) : undefined,
  });

  const notes = [...(recovery.active ? [RECOVERY_MESSAGE] : []), ...adaptation.notes, ...out.notes];
  const startOrder = kept.length;
  await prisma.$transaction(async (tx) => {
    const planDay = await tx.planDay.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, capacityMinutes: capacity, plannedMinutes: out.plannedMinutes, mode: recovery.active ? "RECOVERY" : "NORMAL", notes: toJson(notes), configVersion: CONFIG_VERSION },
      update: { capacityMinutes: capacity + kept.reduce((s, t) => s + t.plannedMinutes, 0), plannedMinutes: out.plannedMinutes + kept.reduce((s, t) => s + t.plannedMinutes, 0), mode: recovery.active ? "RECOVERY" : "NORMAL", notes: toJson(notes), generatedAt: now, configVersion: CONFIG_VERSION },
    });
    const carryCounts = new Map(carries.map((c) => [c.id, c.carryCount]));
    const data: Prisma.TaskCreateManyInput[] = out.tasks.map((t, i) => ({
      userId,
      planDayId: planDay.id,
      date,
      type: t.type,
      title: t.title,
      subjectId: t.subjectId,
      topicId: t.topicId,
      mockId: t.mockId,
      startTime: t.startTime,
      plannedMinutes: t.plannedMinutes,
      questionTarget: t.questionTarget,
      objective: t.objective,
      order: startOrder + i,
      priorityScore: t.priorityScore,
      reasons: toJson(t.reasons),
      source: t.source,
      isOptional: t.isOptional,
      carriedFromId: t.carriedFromId,
      carryCount: t.carriedFromId ? (carryCounts.get(t.carriedFromId) ?? 0) + 1 : 0,
    }));
    if (data.length) await tx.task.createMany({ data });
    const placedCarry = out.tasks.map((t) => t.carriedFromId).filter((x): x is string => !!x);
    if (placedCarry.length) await tx.task.updateMany({ where: { id: { in: placedCarry } }, data: { carryConsumed: true } });
    const placedTopics = out.tasks.map((t) => t.topicId).filter((x): x is string => !!x);
    await tx.task.updateMany({ where: { userId, carryConsumed: false, missedAction: "MERGE", topicId: { in: placedTopics } }, data: { carryConsumed: true } });
  });

  await recomputeDailyStat(userId, date, ctx.tz);
  return getDayPlan(userId, date);
}

export async function getDayPlan(userId: string, date: string) {
  const planDay = await prisma.planDay.findUnique({ where: { userId_date: { userId, date } } });
  const tasks = await prisma.task.findMany({ where: { userId, date }, include: { topic: { select: { name: true } } }, orderBy: [{ order: "asc" }, { startTime: "asc" }] });
  const backlog = await prisma.task.findMany({ where: { userId, carryConsumed: false, missedAction: { not: null } }, orderBy: { date: "desc" }, take: 20 });
  return {
    date,
    planDay: planDay ? { ...planDay, notes: parseJson<string[]>(planDay.notes, []) } : null,
    tasks: tasks.map((t) => ({ ...t, reasons: parseJson<string[]>(t.reasons, []) })),
    backlog: backlog.map((t) => ({ id: t.id, title: t.title, date: t.date, action: t.missedAction, reason: t.missedReason, minutes: t.carryMinutes, carryOn: t.carryOn })),
  };
}
export type DayPlan = Awaited<ReturnType<typeof getDayPlan>>;

/** Projection of the coming days. Not persisted: each day's real plan is generated that morning from fresh data. */
export async function weekOutline(userId: string, now = new Date()) {
  const ctx = await getStudentContext(userId, now);
  const insights = await loadTopicInsights(userId, ctx.exam.id, ctx.today, now);
  const pace = await paceFor(ctx, now);
  const ranked = insights
    .filter((i) => i.signals.status !== "COMPLETED" || i.weakness.isWeak)
    .map((i) => ({ i, p: scoreTopic(i.signals, { today: ctx.today, examDate: ctx.profile.examDate }) }))
    .sort((a, b) => b.p.score - a.p.score);
  const perDay = Math.max(2, Math.floor(ctx.profile.dailyMinutes / Math.max(PLANNER.minBlock, ctx.profile.preferredBlockMin)) - 1);
  const mockEvery = Math.max(1, Math.floor(7 / pace.mocks.required));
  const days = [];
  for (let d = 1; d <= 6; d++) {
    const date = addDays(ctx.today, d);
    const focus = ranked.slice(((d - 1) * perDay) % Math.max(1, ranked.length), ((d - 1) * perDay) % Math.max(1, ranked.length) + perDay).map((x) => `${x.i.signals.subjectName}: ${x.i.signals.topicName}`);
    const revisions = insights.filter((i) => i.signals.nextRevisionOn === date).map((i) => i.signals.topicName);
    days.push({ date, focus, revisions, mockLikely: d % mockEvery === 0 && pace.daysLeft > d });
  }
  return { days, note: "Projection. Each day's detailed plan is generated that morning from your latest results." };
}

// ───────────────────────── Manual editing ─────────────────────────

async function ownTask(userId: string, id: string) {
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t || t.userId !== userId) throw notFound("Task");
  return t;
}

async function validateDay(userId: string, date: string, patched: { id?: string; title: string; startTime: string | null; plannedMinutes: number; status?: string }[]) {
  const planDay = await prisma.planDay.findUnique({ where: { userId_date: { userId, date } } });
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  const capacity = planDay?.capacityMinutes ?? profile?.dailyMinutes ?? 240;
  const v = validatePlan(patched, Math.max(capacity, profile?.dailyMinutes ?? 0));
  if (!v.ok) throw badRequest(v.errors[0], v);
  return v;
}

export async function updateTask(userId: string, id: string, patch: { title?: string; startTime?: string | null; plannedMinutes?: number; questionTarget?: number; objective?: string; status?: "PENDING" | "SKIPPED"; isOptional?: boolean; missedAction?: string }) {
  const t = await ownTask(userId, id);
  if (patch.missedAction) {
    if (!t.missedAction) throw badRequest("Only missed tasks can be re-triaged.");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const today = dayKey(new Date(), user.timezone);
    const offset = patch.missedAction === "POSTPONE" ? 2 : 0;
    await prisma.task.update({
      where: { id },
      data: {
        missedAction: patch.missedAction,
        missedReason: "Changed by you.",
        carryOn: addDays(today, offset),
        carryMinutes: patch.missedAction === "MERGE" ? t.carryMinutes : Math.max(t.carryMinutes, t.plannedMinutes - t.actualMinutes),
        carryConsumed: false,
      },
    });
    return { warnings: [] as string[] };
  }
  const dayTasks = await prisma.task.findMany({ where: { userId, date: t.date } });
  const patched = dayTasks.map((x) => (x.id === id ? { ...x, ...patch, startTime: patch.startTime === undefined ? x.startTime : patch.startTime } : x));
  const v = await validateDay(userId, t.date, patched);
  await prisma.task.update({ where: { id }, data: { ...patch } });
  return { warnings: v.warnings };
}

export async function reorderTasks(userId: string, date: string, orderedIds: string[], now = new Date()) {
  const ctx = await getStudentContext(userId, now);
  const tasks = await prisma.task.findMany({ where: { userId, date } });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (orderedIds.some((id) => !byId.has(id))) throw badRequest("Unknown task in order.");
  const ordered = orderedIds.map((id) => byId.get(id)!);
  const rest = tasks.filter((t) => !orderedIds.includes(t.id));
  const movable = ordered.filter((t) => t.status === "PENDING");
  const fixed = [...ordered, ...rest].filter((t) => t.status !== "PENDING");

  // Re-time pending blocks in the new order, after anything already done/started.
  const lastFixedEnd = fixed.filter((t) => t.startTime).reduce((m, t) => Math.max(m, toMinutes(t.startTime!) + t.plannedMinutes), 0);
  const notBefore = Math.max(date === ctx.today ? localMinutes(now, ctx.tz) : 0, lastFixedEnd ? lastFixedEnd + PLANNER.breakMinutes : 0);
  const retimed = assignTimes(movable.map((t) => ({ ...t })), ctx.slots, notBefore || undefined);
  const final = [...ordered.map((t) => retimed.find((r) => r.id === t.id) ?? t), ...rest];
  const v = await validateDay(userId, date, final.filter((t) => t.startTime !== null || t.status !== "PENDING"));
  await prisma.$transaction(final.map((t, i) => prisma.task.update({ where: { id: t.id }, data: { order: i, startTime: t.startTime } })));
  return { warnings: v.warnings };
}

export async function addTask(userId: string, input: { date: string; title: string; type: string; topicId?: string | null; startTime?: string | null; plannedMinutes: number; questionTarget: number; objective: string }) {
  const ctx = await getStudentContext(userId);
  if (input.date < ctx.today) throw badRequest("You can't add tasks to a past day.");
  let subjectId: string | null = null;
  if (input.topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: input.topicId }, include: { subject: true } });
    if (!topic || topic.subject.examId !== ctx.exam.id) throw badRequest("Unknown topic.");
    subjectId = topic.subjectId;
  }
  const dayTasks = await prisma.task.findMany({ where: { userId, date: input.date } });
  let startTime = input.startTime ?? null;
  if (!startTime) {
    const end = dayTasks.filter((t) => t.startTime).reduce((m, t) => Math.max(m, toMinutes(t.startTime!) + t.plannedMinutes + PLANNER.breakMinutes), toMinutes(PLANNER.slotStarts[ctx.slots[0]] ?? "07:00"));
    startTime = end + input.plannedMinutes <= 24 * 60 ? toHHMM(end) : null;
  }
  const v = await validateDay(userId, input.date, [...dayTasks, { title: input.title, startTime, plannedMinutes: input.plannedMinutes, status: "PENDING" }]);
  const planDay = await prisma.planDay.findUnique({ where: { userId_date: { userId, date: input.date } } });
  const task = await prisma.task.create({
    data: {
      userId, planDayId: planDay?.id ?? null, date: input.date, type: input.type, title: input.title, topicId: input.topicId ?? null, subjectId,
      startTime, plannedMinutes: input.plannedMinutes, questionTarget: input.questionTarget, objective: input.objective, order: dayTasks.length,
      source: "MANUAL", reasons: toJson(["added by you"]),
    },
  });
  await recomputeDailyStat(userId, input.date, ctx.tz);
  return { task, warnings: v.warnings };
}

/** Manual tasks are deleted; generated ones are marked skipped (visible, restorable), never silently removed. */
export async function removeTask(userId: string, id: string) {
  const t = await ownTask(userId, id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (t.source === "MANUAL" && t.actualMinutes === 0) await prisma.task.delete({ where: { id } });
  else await prisma.task.update({ where: { id }, data: { status: "SKIPPED" } });
  await recomputeDailyStat(userId, t.date, user.timezone);
}

export async function setRecoveryMode(userId: string, on: boolean) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dayKey(new Date(), user.timezone);
  await prisma.studentProfile.update({ where: { userId }, data: { recoveryMode: on, recoveryManual: on, recoverySince: on ? today : null } });
  // Distinct names: the "Back on track" badge requires an earned exit, not a toggle.
  await trackEvent(userId, on ? "recovery_manual_enter" : "recovery_manual_exit", { manual: true });
}
