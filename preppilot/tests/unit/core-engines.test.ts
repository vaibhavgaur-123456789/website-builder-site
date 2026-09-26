import { describe, expect, it } from "vitest";
import { addDays, dayKey, diffDays, isDayKey, weekStart, toHHMM, toMinutes } from "@/lib/engine/dates";
import { scoreTopic, suggestTaskType, type TopicSignals } from "@/lib/engine/priority";
import { buildDayPlan, validatePlan, type PlanInput, type PlanCandidate } from "@/lib/engine/planner";
import { triageMissedTask, completionMessage } from "@/lib/engine/triage";
import { adapt } from "@/lib/engine/adaptation";

const topic = (over: Partial<TopicSignals> = {}): TopicSignals => ({
  topicId: "t1", topicName: "Percentage", subjectId: "s1", subjectName: "Maths", weightage: 5, subjectShare: 1, difficulty: 3,
  status: "IN_PROGRESS", minutesStudied: 60, estimatedMinutes: 240, attempts: 50, correct: 29, recentAttempts: 20, recentCorrect: 10,
  previousAttempts: 20, previousCorrect: 15, nextRevisionOn: "2026-09-20", recentMistakes: 4, unfinishedMinutes: 0, subjectDeficit: 0, recoveryStep: 0,
  ...over,
});

describe("dates", () => {
  it("computes day keys in the student's timezone", () => {
    // 20:00 UTC on 25 Sep is 01:30 on 26 Sep in India.
    expect(dayKey(new Date("2026-09-25T20:00:00Z"), "Asia/Kolkata")).toBe("2026-09-26");
    expect(dayKey(new Date("2026-09-25T20:00:00Z"), "UTC")).toBe("2026-09-25");
  });
  it("does calendar arithmetic across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2026-02-27", "2026-03-02")).toBe(3);
    expect(weekStart("2026-09-26")).toBe("2026-09-21"); // Saturday → Monday
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(toHHMM(toMinutes("06:30") + 50)).toBe("07:20");
  });
});

describe("priority engine", () => {
  it("explains why a topic was scheduled", () => {
    const r = scoreTopic(topic(), { today: "2026-09-26", examDate: "2026-10-14" });
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.reasons).toContain("accuracy is 58% over 50 questions");
    expect(r.reasons).toContain("high-weightage topic");
    expect(r.reasons).toContain("revision is overdue by 6 days");
    expect(r.reasons).toContain("you have 18 days remaining");
    expect(r.reasons.some((x) => x.startsWith("accuracy is declining"))).toBe(true);
  });
  it("ranks a weak, overdue, important topic above a mastered minor one", () => {
    const ctx = { today: "2026-09-26", examDate: "2026-12-01" };
    const strong = scoreTopic(topic({ weightage: 1, subjectShare: 0.3, attempts: 80, correct: 76, recentMistakes: 0, nextRevisionOn: "2026-10-10", status: "COMPLETED", recentCorrect: 19, previousCorrect: 19 }), ctx);
    const weak = scoreTopic(topic(), ctx);
    expect(weak.score).toBeGreaterThan(strong.score);
  });
  it("respects custom weights", () => {
    const ctx = { today: "2026-09-26", examDate: "2026-12-01" };
    const only = { importance: 1, weakness: 0, revisionUrgency: 0, errorRate: 0, timePressure: 0, trend: 0, unfinished: 0 };
    expect(scoreTopic(topic({ weightage: 5, subjectShare: 1 }), ctx, only).score).toBe(1);
  });
  it("suggests study before practice", () => {
    expect(suggestTaskType({ status: "NOT_STARTED", minutesStudied: 0, estimatedMinutes: 100, recoveryStep: 0 })).toBe("STUDY");
    expect(suggestTaskType({ status: "COMPLETED", minutesStudied: 300, estimatedMinutes: 100, recoveryStep: 0 })).toBe("PRACTICE");
    expect(suggestTaskType({ status: "COMPLETED", minutesStudied: 300, estimatedMinutes: 100, recoveryStep: 1 })).toBe("STUDY");
  });
});

const cand = (i: number, over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  topicId: `t${i}`, topicName: `Topic ${i}`, subjectId: `s${i % 3}`, subjectName: `Subject ${i % 3}`, score: 1 - i * 0.05,
  reasons: ["because"], taskType: "STUDY", remainingMinutes: 120, recoveryStep: 0, isWeak: false, ...over,
});
const baseInput = (over: Partial<PlanInput> = {}): PlanInput => ({
  capacityMinutes: 240, slots: ["MORNING", "EVENING"], blockMinutes: 45, candidates: Array.from({ length: 10 }, (_, i) => cand(i)),
  revisionsDue: [], carryOvers: [], unresolvedMistakes: 0, mock: null, pendingMockAnalysis: null, mode: "NORMAL", finalPhase: false, ...over,
});

describe("planner engine", () => {
  it("never plans more than capacity and produces a valid, non-overlapping timeline", () => {
    for (const cap of [30, 90, 180, 240, 420, 600]) {
      const out = buildDayPlan(baseInput({ capacityMinutes: cap }));
      expect(out.plannedMinutes).toBeLessThanOrEqual(cap);
      expect(validatePlan(out.tasks, cap).ok).toBe(true);
      expect(out.tasks.every((t) => t.startTime !== null && t.reasons.length > 0)).toBe(true);
    }
  });
  it("keeps subject diversity when there are alternatives", () => {
    const out = buildDayPlan(baseInput({ capacityMinutes: 180 }));
    const subjects = new Set(out.tasks.map((t) => t.subjectId));
    expect(subjects.size).toBeGreaterThanOrEqual(3);
  });
  it("includes due revisions with reasons but caps them", () => {
    const revisionsDue = Array.from({ length: 8 }, (_, i) => ({ topicId: `r${i}`, topicName: `R${i}`, subjectId: "s1", subjectName: "S", overdueDays: i, stage: 1 }));
    const out = buildDayPlan(baseInput({ capacityMinutes: 200, revisionsDue }));
    const revs = out.tasks.filter((t) => t.type === "REVISION");
    expect(revs.length).toBe(3); // 30% of 200 = 60 min → 3 × 20
    expect(revs[0].reasons[0]).toMatch(/overdue by 7 days/);
    expect(out.dropped.filter((d) => d.reason.includes("stays due")).length).toBe(5);
  });
  it("schedules mock first and its analysis", () => {
    const out = buildDayPlan(baseInput({ mock: { mockId: "m1", title: "Full mock", minutes: 60, reason: "weekly mock" }, pendingMockAnalysis: { attemptId: "a", title: "Mock 3" } }));
    expect(out.tasks[0].type).toBe("MOCK");
    expect(out.tasks.some((t) => t.type === "MOCK_ANALYSIS")).toBe(true);
  });
  it("recovery mode drops low-priority topics and says so", () => {
    const out = buildDayPlan(baseInput({ mode: "RECOVERY", minScore: 0.8 }));
    expect(out.tasks.every((t) => t.priorityScore >= 0.8 || t.type !== "STUDY")).toBe(true);
    expect(out.notes.join(" ")).toMatch(/Recovery mode/);
    expect(out.tasks.every((t) => t.source === "RECOVERY")).toBe(true);
  });
  it("final phase avoids brand-new non-weak topics", () => {
    const out = buildDayPlan(baseInput({ finalPhase: true, candidates: [cand(1), cand(2, { taskType: "PRACTICE" }), cand(3, { isWeak: true })] }));
    expect(out.tasks.map((t) => t.topicId)).not.toContain("t1");
    expect(out.tasks.map((t) => t.topicId)).toEqual(expect.arrayContaining(["t2", "t3"]));
  });
  it("rejects impossible manual schedules", () => {
    const v = validatePlan(
      [
        { title: "A", startTime: "06:30", plannedMinutes: 60 },
        { title: "B", startTime: "07:00", plannedMinutes: 30 },
        { title: "C", startTime: "23:30", plannedMinutes: 60 },
        { title: "D", startTime: null, plannedMinutes: 200 },
      ],
      120,
    );
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/overlaps/);
    expect(v.errors.join(" ")).toMatch(/past midnight/);
    expect(v.errors.join(" ")).toMatch(/longer than 180/);
    expect(v.errors.join(" ")).toMatch(/available today/);
  });
});

describe("missed-task triage", () => {
  const ctx = { upcomingTopicIds: new Set(["merge-me"]) };
  const base = { type: "STUDY", topicId: "x", plannedMinutes: 60, actualMinutes: 0, completionPct: 0, priorityScore: 0.5, carryCount: 0 };
  it("classifies every case", () => {
    expect(triageMissedTask({ ...base, actualMinutes: 40, completionPct: 66 }, ctx)).toMatchObject({ action: "REDUCE", carryMinutes: 20 });
    expect(triageMissedTask({ ...base, topicId: "merge-me" }, ctx).action).toBe("MERGE");
    expect(triageMissedTask({ ...base, type: "REVISION" }, ctx).action).toBe("RESCHEDULE");
    expect(triageMissedTask({ ...base, priorityScore: 0.7 }, ctx).action).toBe("RESCHEDULE");
    expect(triageMissedTask({ ...base, priorityScore: 0.2 }, ctx).action).toBe("OPTIONAL");
    expect(triageMissedTask({ ...base, carryCount: 2 }, ctx).action).toBe("OPTIONAL");
    expect(triageMissedTask(base, ctx)).toMatchObject({ action: "POSTPONE", offsetDays: 2 });
  });
  it("uses supportive language", () => {
    expect(completionMessage(62)).toBe("You completed 62% of today's plan. Let's recover the remaining 38% tomorrow.");
    expect(completionMessage(0)).not.toMatch(/lazy|fail/i);
  });
});

describe("adaptation engine", () => {
  const days = (planned: number, actual: number, blocker: null | "LOW_ENERGY" | "PHONE" | "DIFFICULT_TOPIC" | "TIME" = null) =>
    Array.from({ length: 5 }, (_, i) => ({ date: `2026-09-2${i}`, planned, actual, blocker }));
  it("sets a realistic stretch when execution is consistently low", () => {
    const r = adapt({ days: days(240, 120), subjects: [], dailyMinutes: 240, blockMinutes: 45 });
    expect(r.executionRatio).toBeCloseTo(0.5);
    expect(r.capacityMultiplier).toBeCloseTo((120 * 1.15) / 240, 2);
    expect(r.notes[0]).toMatch(/realistic stretch/);
  });
  it("reacts to night-review blockers", () => {
    expect(adapt({ days: days(100, 100, "LOW_ENERGY"), subjects: [], dailyMinutes: 100, blockMinutes: 45 }).blockMinutes).toBe(30);
    expect(adapt({ days: days(100, 100, "PHONE"), subjects: [], dailyMinutes: 100, blockMinutes: 45 }).blockMinutes).toBe(25);
    expect(adapt({ days: days(100, 100, "DIFFICULT_TOPIC"), subjects: [], dailyMinutes: 100, blockMinutes: 45 }).easeIn).toBe(true);
  });
  it("detects the under-served subject (planned 2h Technical, did 30m)", () => {
    const r = adapt({
      days: [], dailyMinutes: 300, blockMinutes: 45,
      subjects: [
        { subjectId: "m", subjectName: "Maths", planned: 120, actual: 90 },
        { subjectId: "r", subjectName: "Reasoning", planned: 60, actual: 60 },
        { subjectId: "t", subjectName: "Technical", planned: 120, actual: 30 },
      ],
    });
    expect(r.subjectDeficits.t).toBeCloseTo(0.75);
    expect(r.subjectDeficits.r).toBe(0);
    expect(r.notes.join(" ")).toMatch(/Technical got 30m of 2h/);
  });
});
