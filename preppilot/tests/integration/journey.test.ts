import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { signup, login } from "@/server/services/auth.service";
import { completeOnboarding, listExams } from "@/server/services/onboarding.service";
import { ensureDayPlan, getDayPlan, updateTask, addTask, reorderTasks } from "@/server/services/planner.service";
import { startSession, completeSession } from "@/server/services/session.service";
import { startAttempt, submitAttempt, createCustomMock } from "@/server/services/mock.service";
import { listMistakes, mistakeSummary, updateMistake } from "@/server/services/mistakes.service";
import { revisionQueue } from "@/server/services/revision.service";
import { readinessHistory } from "@/server/services/readiness.service";
import { xpSummary } from "@/server/services/gamification.service";
import { createSession, resolveSession, destroySession } from "@/server/auth/session";
import { addDays, dayKey } from "@/lib/engine/dates";

// A fixed "now": 08:00 IST on a Monday.
const NOW = new Date("2026-10-05T02:30:00Z");
const at = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
let userId = "";
let examId = "";

beforeAll(async () => {
  const exams = await listExams();
  examId = exams.find((e) => e.shortName === "SSC CGL")!.id;
});
afterAll(() => prisma.$disconnect());

describe("authentication", () => {
  it("signs up with a hashed password and logs in", async () => {
    const u = await signup({ name: "Aarti", email: "aarti@test.dev", password: "correct-horse-1", timezone: "Asia/Kolkata" });
    userId = u.id;
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordHash).not.toContain("correct-horse");
    expect(row.passwordHash?.startsWith("$2")).toBe(true);
    await expect(signup({ name: "Dup", email: "aarti@test.dev", password: "another-pass-1" })).rejects.toThrow(/already exists/);
    await expect(login("aarti@test.dev", "wrong-password")).rejects.toThrow(/incorrect/);
    expect((await login("aarti@test.dev", "correct-horse-1")).id).toBe(u.id);
  });
  it("issues revocable sessions", async () => {
    const { token } = await createSession(userId);
    expect((await resolveSession(token))?.user.id).toBe(userId);
    await destroySession(token);
    expect(await resolveSession(token)).toBeNull();
    expect(await resolveSession("not-a-token")).toBeNull();
  });
});

describe("core journey", () => {
  let firstTaskId = "";

  it("onboarding produces a baseline, plan, revision schedule and readiness estimate", async () => {
    const exam = (await listExams()).find((e) => e.id === examId)!;
    const quant = exam.subjects.find((s) => s.name.startsWith("Quant"))!;
    const english = exam.subjects.find((s) => s.name === "English")!;
    const res = await completeOnboarding(
      userId,
      {
        name: "Aarti", examId, examDate: addDays(dayKey(NOW), 90), prepLevel: "INTERMEDIATE", dailyMinutes: 240, preferredSlots: ["MORNING", "EVENING"],
        completedTopicIds: english.topics.slice(0, 3).map((t) => t.id), inProgressTopicIds: [quant.topics[0].id],
        weakSubjectIds: [quant.id], strongSubjectIds: [english.id], previousMockScores: [52, 58], language: "en", notifications: true, benchmarkOptIn: true,
      },
      NOW,
    );
    expect(res.baseline.topicsCompleted).toBe(3);
    expect(res.baseline.subjectDistribution.find((s) => s.subjectId === quant.id)?.selfReported).toBe("WEAK");
    expect(res.readiness.confidence).toBe("LOW");
    expect(res.plan.tasks.length).toBeGreaterThan(2);
    expect(res.plan.planDay!.plannedMinutes).toBeLessThanOrEqual(240);
    expect(res.plan.tasks.every((t) => t.reasons.length > 0)).toBe(true);
    // A self-reported weak subject is prioritised, and the reason says so.
    expect(res.plan.tasks.some((t) => t.reasons.some((r) => r.includes("weak subject")))).toBe(true);
    const revs = await prisma.revisionEvent.count({ where: { userId } });
    expect(revs).toBe(3);
    firstTaskId = res.plan.tasks.find((t) => t.type === "STUDY" || t.type === "PRACTICE")!.id;
  });

  it("ensureDayPlan is idempotent", async () => {
    const a = await ensureDayPlan(userId, { now: NOW });
    const b = await ensureDayPlan(userId, { now: NOW });
    expect(b.tasks.map((t) => t.id)).toEqual(a.tasks.map((t) => t.id));
  });

  it("rejects impossible manual edits", async () => {
    await expect(updateTask(userId, firstTaskId, { plannedMinutes: 240, startTime: "23:00" })).rejects.toThrow();
    await expect(addTask(userId, { date: dayKey(NOW), title: "Marathon", type: "CUSTOM", plannedMinutes: 240, questionTarget: 0, objective: "" })).rejects.toThrow(/available/);
    const plan = await getDayPlan(userId, dayKey(NOW));
    const ids = plan.tasks.map((t) => t.id).reverse();
    await reorderTasks(userId, dayKey(NOW), ids, NOW);
    const after = await getDayPlan(userId, dayKey(NOW));
    expect(after.tasks[0].id).toBe(ids[0]);
  });

  it("a study session records actual vs planned, awards capped XP and schedules revision", async () => {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: firstTaskId } });
    const s = await startSession(userId, { clientId: "client-session-0001", taskId: task.id, mode: "TIMER", plannedMinutes: task.plannedMinutes, startedAt: NOW }, NOW);
    const end = at(NOW, 50);
    const r = await completeSession(
      userId,
      { clientId: s.clientId, endedAt: end, activeSeconds: 45 * 60, breakSeconds: 5 * 60, pauseCount: 1, questionsAttempted: 30, questionsCorrect: 21, focusRating: 4, energyRating: 3, difficultyRating: 3, distractionCount: 2, completionPct: 100, notes: "", topicCompleted: true },
      end,
    );
    expect(r.session.validated).toBe(true);
    expect(r.xp.find((x) => x.type === "STUDY")?.amount).toBe(45);
    expect(r.xp.find((x) => x.type === "QUESTIONS")?.amount).toBe(21);
    expect(r.xp.find((x) => x.type === "CONSISTENCY")).toBeTruthy();
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: firstTaskId } });
    expect(updated.plannedMinutes).toBe(task.plannedMinutes); // plan untouched
    expect(updated.actualMinutes).toBe(45);
    expect(updated.status).toBe("DONE");
    const st = await prisma.userTopicState.findUniqueOrThrow({ where: { userId_topicId: { userId, topicId: task.topicId! } } });
    expect(st.status).toBe("COMPLETED");
    expect(st.nextRevisionOn).toBe(addDays(dayKey(NOW), 1));
    // Replaying the same completion (offline outbox) is idempotent.
    const again = await completeSession(userId, { clientId: s.clientId, endedAt: end, activeSeconds: 45 * 60, breakSeconds: 0, pauseCount: 0, questionsAttempted: 30, questionsCorrect: 21, distractionCount: 0, completionPct: 100, notes: "", topicCompleted: true }, end);
    expect(again.duplicate).toBe(true);
    const xp = await xpSummary(userId, dayKey(NOW));
    expect(xp.xp).toBeGreaterThanOrEqual(45 + 21 + 10);
  });

  it("anti-gaming: timer spam earns nothing and overlapping sessions are not double-counted", async () => {
    const t0 = at(NOW, 60);
    const spam = await startSession(userId, { clientId: "client-spam-0001", mode: "STOPWATCH", plannedMinutes: 0, startedAt: t0 }, t0);
    const r = await completeSession(userId, { clientId: spam.clientId, endedAt: at(t0, 1), activeSeconds: 3600, breakSeconds: 0, pauseCount: 0, questionsAttempted: 500, questionsCorrect: 500, distractionCount: 0, completionPct: 100, notes: "", topicCompleted: false }, at(t0, 1));
    expect(r.session.validated).toBe(false);
    expect(r.session.activeSeconds).toBeLessThanOrEqual(60);
    expect(r.xp.filter((x) => x.type === "STUDY" || x.type === "QUESTIONS")).toEqual([]);
    // A session claiming the same time window as the first one.
    const dup = await startSession(userId, { clientId: "client-overlap-01", mode: "STOPWATCH", plannedMinutes: 0, startedAt: NOW }, at(NOW, 70));
    const o = await completeSession(userId, { clientId: dup.clientId, endedAt: at(NOW, 50), activeSeconds: 45 * 60, breakSeconds: 0, pauseCount: 0, questionsAttempted: 0, questionsCorrect: 0, distractionCount: 0, completionPct: 100, notes: "", topicCompleted: false }, at(NOW, 70));
    expect(o.session.validated).toBe(false);
  });

  it("a mock is scored on the server; wrong answers enter the mistake book; readiness updates", async () => {
    const mock = await prisma.mock.findFirstOrThrow({ where: { examId, type: "SECTIONAL", title: { contains: "Quantitative" } } });
    const t0 = at(NOW, 120);
    const player = await startAttempt(userId, mock.id, t0);
    expect(JSON.stringify(player.questions)).not.toContain("correctIndex");
    const qs = await prisma.question.findMany({ where: { id: { in: player.questions.map((q) => q.id) } } });
    const answers = Object.fromEntries(
      qs.map((q, i) => [q.id, { selected: i % 5 === 4 ? null : i % 3 === 0 ? (q.correctIndex + 1) % 4 : q.correctIndex, timeSpentSec: 40, confidence: (i % 2 ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM" }]),
    );
    const res = await submitAttempt(userId, player.id, answers, at(t0, 12));
    expect(res.correct + res.wrong + res.skipped).toBe(qs.length);
    expect(res.wrong).toBeGreaterThan(0);
    expect(res.analysis.bySubject.length).toBeGreaterThan(0);
    expect(res.xp.find((x) => x.type === "MOCK")).toBeTruthy();
    const mistakes = await listMistakes(userId);
    expect(mistakes.length).toBe(res.wrong);
    const sum = await mistakeSummary(userId);
    expect(sum.top?.message).toMatch(/Your top recurring mistake is/);
    await updateMistake(userId, mistakes[0].id, { category: "CARELESS" });
    const fixed = await prisma.mistake.findUniqueOrThrow({ where: { id: mistakes[0].id } });
    expect(fixed.category).toBe("CARELESS");
    // Resubmitting is idempotent.
    const again = await submitAttempt(userId, player.id, {}, at(t0, 20));
    expect(again.correct).toBe(res.correct);
    const hist = await readinessHistory(userId);
    expect(hist.at(-1)!.components.mock).not.toBeNull();
  });

  it("revision is due the next day and tomorrow's plan adapts (mock analysis + revision + carry-over)", async () => {
    const tomorrow = at(NOW, 24 * 60);
    const q = await revisionQueue(userId, examId, dayKey(tomorrow));
    expect(q.some((r) => r.due)).toBe(true);
    const plan = await ensureDayPlan(userId, { now: tomorrow });
    const types = plan.tasks.map((t) => t.type);
    expect(types).toContain("REVISION");
    expect(types).toContain("MOCK_ANALYSIS");
    // Yesterday's untouched tasks were triaged, not deleted.
    const yesterday = await prisma.task.findMany({ where: { userId, date: dayKey(NOW), status: { in: ["MISSED", "PARTIAL"] } } });
    expect(yesterday.length).toBeGreaterThan(0);
    expect(yesterday.every((t) => t.missedAction !== null && t.missedReason)).toBe(true);
  });

  it("custom weak-topic tests only use this exam's questions", async () => {
    const r = await createCustomMock(userId, { subjectIds: [], topicIds: [], count: 10, durationMinutes: 10, focus: "MIXED" }, NOW);
    expect(r.questionCount).toBe(10);
    const qs = await prisma.mockQuestion.findMany({ where: { mockId: r.mockId }, include: { question: { include: { topic: { include: { subject: true } } } } } });
    expect(qs.every((x) => x.question.topic.subject.examId === examId)).toBe(true);
  });
});

describe("recovery mode", () => {
  it("activates after several low-completion days and plans less, then says so", async () => {
    const u = await signup({ name: "Rohit", email: "rohit@test.dev", password: "rohit-pass-123" });
    const start = new Date("2026-10-01T02:30:00Z");
    await completeOnboarding(u.id, { name: "Rohit", examId, examDate: "2026-11-20", prepLevel: "BEGINNER", dailyMinutes: 180, preferredSlots: ["EVENING", "NIGHT"], completedTopicIds: [], inProgressTopicIds: [], weakSubjectIds: [], strongSubjectIds: [], previousMockScores: [], language: "en", notifications: true, benchmarkOptIn: false }, start);
    // Four days of plans with little or nothing done.
    for (let d = 1; d <= 4; d++) await ensureDayPlan(u.id, { now: at(start, d * 24 * 60) });
    const day5 = await ensureDayPlan(u.id, { now: at(start, 5 * 24 * 60) });
    const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: u.id } });
    expect(profile.recoveryMode).toBe(true);
    expect(day5.planDay!.mode).toBe("RECOVERY");
    expect(day5.planDay!.plannedMinutes).toBeLessThan(180);
    expect(day5.planDay!.notes[0]).toMatch(/We will not try to complete everything at once/);
    const note = await prisma.notification.findFirst({ where: { userId: u.id, title: "Recovery mode is on" } });
    expect(note).toBeTruthy();
  });
});
