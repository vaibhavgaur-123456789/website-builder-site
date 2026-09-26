import { describe, expect, it } from "vitest";
import { applyReview, initialSrs, reviewQuality } from "@/lib/engine/revision";
import { computeReadiness, confidenceOf, type ReadinessInput } from "@/lib/engine/readiness";
import { computeDailyScore } from "@/lib/engine/scoring";
import { levelFromXp, mockXp, sessionXp, validateSession, consistencyXp } from "@/lib/engine/xp";
import { scoreMock, type MockQuestionInfo } from "@/lib/engine/mockScoring";
import { categorizeMistake, topRecurring } from "@/lib/engine/mistakes";
import { assessWeakness, nextPathwayStep } from "@/lib/engine/weakness";
import { evaluateRecovery } from "@/lib/engine/recovery";
import { computePace } from "@/lib/engine/pace";
import { currentStreak, bestStreak } from "@/lib/engine/streaks";
import { aggregateValues, compareToBenchmark } from "@/lib/engine/benchmark";
import { computeInsights, type SessionFact } from "@/lib/engine/insights";
import { cascadeGoals } from "@/lib/engine/goals";

describe("spaced revision", () => {
  it("starts at day 1 and climbs the ladder on good recall", () => {
    let s = initialSrs("2026-09-01");
    expect(s.nextRevisionOn).toBe("2026-09-02");
    const r1 = applyReview(s, 0.85, "2026-09-02");
    expect(r1.outcome).toBe("ADVANCED");
    expect(r1.intervalDays).toBe(3);
    s = r1;
    const r2 = applyReview(s, 0.85, "2026-09-05");
    expect(r2.srsStage).toBe(2);
    expect(r2.intervalDays).toBeGreaterThanOrEqual(7);
  });
  it("brings forgotten topics back sooner and handles leeches", () => {
    const s = { srsStage: 3, easeFactor: 2.5, intervalDays: 14, lapses: 2, nextRevisionOn: null };
    const r = applyReview(s, 0.4, "2026-09-10");
    expect(r.outcome).toBe("LAPSED");
    expect(r.srsStage).toBe(1);
    expect(r.intervalDays).toBe(1);
    expect(r.lapses).toBe(3);
    const after = applyReview(r, 0.82, "2026-09-11");
    expect(after.intervalDays).toBeLessThan(7); // leech factor shortens intervals
  });
  it("blends accuracy and recall", () => {
    expect(reviewQuality(0.9, null)).toBe(0.9);
    expect(reviewQuality(null, 1)).toBe(0.3);
    expect(reviewQuality(0.7, 4)).toBeCloseTo(0.825);
  });
});

const rin = (o: Partial<ReadinessInput> = {}): ReadinessInput => ({
  coverage: 0.78, mockPercents: [60, 65, 72], attempts30: 400, correct30: 296, revisionsDue30: 20, revisionsOnTime30: 13,
  activeDays14: 11, daysSinceStart: 60, weeklyAccuracy: [0.68, 0.7, 0.72, 0.75], totalMocks: 12, totalQuestions: 900, totalActiveDays: 50, ...o,
});

describe("readiness engine", () => {
  it("computes a transparent weighted score", () => {
    const r = computeReadiness(rin());
    const byKey = Object.fromEntries(r.components.map((c) => [c.key, c.value]));
    expect(byKey).toMatchObject({ coverage: 78, accuracy: 74, revision: 65, consistency: 79 });
    expect(byKey.mock).toBe(Math.round(72 * 0.5 + 65 * 0.3 + 60 * 0.2));
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThan(85);
    expect(r.confidence).toBe("HIGH");
  });
  it("reweights missing components and lowers confidence", () => {
    const r = computeReadiness(rin({ mockPercents: [], attempts30: 5, correct30: 4, revisionsDue30: 0, weeklyAccuracy: [null, 0.6], totalMocks: 0, totalQuestions: 5, totalActiveDays: 2 }));
    expect(r.components.find((c) => c.key === "mock")!.value).toBeNull();
    expect(r.confidence).toBe("LOW");
    expect(r.measuredWeightShare).toBeLessThan(0.6);
  });
  it("confidence grows with evidence", () => {
    expect(confidenceOf(1, 50, 3).level).toBe("LOW");
    expect(confidenceOf(5, 300, 12).level).toBe("MEDIUM");
    expect(confidenceOf(15, 800, 30).level).toBe("HIGH");
  });
});

describe("daily score", () => {
  it("matches the spec breakdown style", () => {
    const d = computeDailyScore({ plannedMinutes: 240, actualMinutes: 200, tasksPlanned: 5, tasksDone: 4, focusRatings: [4, 4], distractions: 1, revisionsDue: 2, revisionsDone: 2, testPlanned: false, testDone: false, questions: 100, correct: 72 });
    expect(d.completionPct).toBe(83);
    expect(d.execution).toBe(82);
    expect(d.revision).toBe(100);
    expect(d.testing).toBe(72);
    expect(d.daily).toBeGreaterThan(70);
  });
  it("omits components that don't apply", () => {
    const d = computeDailyScore({ plannedMinutes: 0, actualMinutes: 0, tasksPlanned: 0, tasksDone: 0, focusRatings: [], distractions: 0, revisionsDue: 0, revisionsDone: 0, testPlanned: false, testDone: false, questions: 0, correct: 0 });
    expect(d.daily).toBeNull();
  });
});

describe("XP & anti-gaming", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  const base = { startedAt: new Date("2026-09-26T09:00:00Z"), serverStartedAt: new Date("2026-09-26T09:00:01Z"), endedAt: now, now, activeSeconds: 3000, breakSeconds: 300, questionsAttempted: 40, questionsCorrect: 30, overlapsAnotherSession: false };
  it("accepts a plausible session", () => {
    const v = validateSession(base);
    expect(v).toMatchObject({ activeSeconds: 3000, validated: true, questionsAttempted: 40 });
  });
  it("caps inflated time and question counts", () => {
    const v = validateSession({ ...base, activeSeconds: 99999, questionsAttempted: 5000, questionsCorrect: 6000 });
    expect(v.activeSeconds).toBe(3600 - 300);
    expect(v.questionsAttempted).toBe(Math.floor((3300 / 60) * 3));
    expect(v.questionsCorrect).toBe(v.questionsAttempted);
    expect(v.flags.length).toBeGreaterThan(0);
  });
  it("rejects start/stop spam and overlaps", () => {
    expect(validateSession({ ...base, endedAt: new Date("2026-09-26T09:02:00Z"), activeSeconds: 120 }).validated).toBe(false);
    expect(validateSession({ ...base, overlapsAnotherSession: true }).validated).toBe(false);
  });
  it("bounds daily XP", () => {
    const x = sessionXp({ id: "s", activeMinutes: 200, correct: 150, validated: true }, { study: 300, questions: 100 });
    expect(x.find((a) => a.type === "STUDY")!.amount).toBe(60);
    expect(x.find((a) => a.type === "QUESTIONS")!.amount).toBe(100);
    expect(sessionXp({ id: "s", activeMinutes: 200, correct: 150, validated: false }, { study: 0, questions: 0 })).toEqual([]);
    expect(x.every((a) => a.dedupeKey.endsWith(":s"))).toBe(true);
  });
  it("only rewards genuine mock attempts", () => {
    expect(mockXp({ attemptId: "a", type: "FULL", attemptRate: 0.1, timeTakenSec: 3000, durationSec: 3600, attempted: 10 })).toBeNull();
    expect(mockXp({ attemptId: "a", type: "FULL", attemptRate: 0.9, timeTakenSec: 60, durationSec: 3600, attempted: 90 })).toBeNull();
    expect(mockXp({ attemptId: "a", type: "FULL", attemptRate: 0.9, timeTakenSec: 3000, durationSec: 3600, attempted: 90 })?.amount).toBe(60);
  });
  it("level curve and streak bonus", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(49).level).toBe(1);
    expect(levelFromXp(50).level).toBe(2);
    expect(levelFromXp(200).level).toBe(3);
    expect(consistencyXp("2026-09-26", 1).amount).toBe(10);
    expect(consistencyXp("2026-09-26", 100).amount).toBe(31);
  });
});

describe("mock scoring", () => {
  const qs: MockQuestionInfo[] = Array.from({ length: 10 }, (_, i) => ({
    questionId: `q${i}`, topicId: i < 5 ? "pct" : "syn", topicName: i < 5 ? "Percentage" : "Synonyms", subjectId: i < 5 ? "math" : "eng",
    subjectName: i < 5 ? "Maths" : "English", correctIndex: 0, marks: 2, expectedSeconds: 40, difficulty: 3,
  }));
  it("applies negative marking and builds breakdowns", () => {
    const answers = {
      q0: { selected: 0, timeSpentSec: 30, confidence: "HIGH" as const },
      q1: { selected: 1, timeSpentSec: 10, confidence: "HIGH" as const }, // overconfident + fast wrong
      q2: { selected: 0, timeSpentSec: 100, confidence: "LOW" as const }, // underconfident, over time
      q3: { selected: null, timeSpentSec: 5, confidence: null },
      q5: { selected: 0, timeSpentSec: 20, confidence: "MEDIUM" as const },
      q6: { selected: 2, timeSpentSec: 5, confidence: "LOW" as const },
    };
    const r = scoreMock(qs, answers, 0.25);
    expect(r).toMatchObject({ correct: 3, wrong: 2, skipped: 5, attempted: 5, maxScore: 20 });
    expect(r.score).toBe(3 * 2 - 2 * 0.5);
    expect(r.accuracy).toBe(0.6);
    expect(r.attemptRate).toBe(0.5);
    expect(r.overconfident).toEqual(["q1"]);
    expect(r.underconfident).toEqual(["q2"]);
    expect(r.bySubject.find((b) => b.id === "math")).toMatchObject({ correct: 2, wrong: 1, skipped: 2 });
    expect(r.time.fastWrong).toBe(2);
    expect(r.insights.join(" ")).toMatch(/high confidence/);
  });
  it("never reports a negative percent", () => {
    const answers = Object.fromEntries(qs.map((q) => [q.questionId, { selected: 3, timeSpentSec: 20, confidence: null }]));
    expect(scoreMock(qs, answers, 0.25).percent).toBe(0);
  });
});

describe("mistakes", () => {
  const s = { timeSpentSec: 40, expectedSeconds: 40, confidence: null, isQuantitative: false, isMemoryBased: false };
  it("auto-categorises with sensible heuristics", () => {
    expect(categorizeMistake({ ...s, confidence: "LOW", timeSpentSec: 10 })).toBe("GUESSING");
    expect(categorizeMistake({ ...s, timeSpentSec: 100 })).toBe("TIME_MANAGEMENT");
    expect(categorizeMistake({ ...s, confidence: "HIGH", timeSpentSec: 15 })).toBe("CARELESS");
    expect(categorizeMistake({ ...s, isMemoryBased: true })).toBe("MEMORY");
    expect(categorizeMistake({ ...s, isQuantitative: true })).toBe("CALCULATION");
    expect(categorizeMistake(s)).toBe("CONCEPTUAL");
  });
  it("finds the top recurring mistake", () => {
    const r = topRecurring(["CALCULATION", "CALCULATION", "CARELESS", "CALCULATION"]);
    expect(r?.message).toBe("Your top recurring mistake is calculation (3 of 4, 75%).");
    expect(topRecurring([])).toBeNull();
  });
});

describe("weakness engine", () => {
  it("flags the spec example as HIGH priority", () => {
    const w = assessWeakness({ attempts: 120, correct: 65, recentAttempts: 30, recentCorrect: 13, previousAttempts: 30, previousCorrect: 18, weightage: 4 });
    expect(w).toMatchObject({ isWeak: true, priority: "HIGH", trend: "DECLINING" });
  });
  it("does not judge on too little data", () => {
    expect(assessWeakness({ attempts: 4, correct: 0, recentAttempts: 4, recentCorrect: 0, previousAttempts: 0, previousCorrect: 0, weightage: 5 }).isWeak).toBe(false);
  });
  it("walks the recovery pathway", () => {
    expect(nextPathwayStep(1, 0).step).toBe(2);
    expect(nextPathwayStep(2, 0.8).step).toBe(3);
    expect(nextPathwayStep(3, 0.6).step).toBe(3);
    expect(nextPathwayStep(3, 0.3).step).toBe(2);
    expect(nextPathwayStep(5, 0.8).step).toBe(0);
    expect(nextPathwayStep(5, 0.6).step).toBe(3);
  });
});

describe("recovery mode", () => {
  const d = (actual: number) => ({ date: "x", planned: 200, actual });
  it("activates after several low days, with realistic capacity", () => {
    const r = evaluateRecovery({ days: [d(180), d(50), d(40), d(0), d(190)], backlogMinutes: 0, dailyCapacity: 240, currentlyActive: false, manual: false, recentAvgActual: 90 });
    expect(r).toMatchObject({ active: true, changed: true });
    expect(r.capacityMinutes).toBeLessThan(240);
  });
  it("activates on a large backlog", () => {
    expect(evaluateRecovery({ days: [], backlogMinutes: 500, dailyCapacity: 240, currentlyActive: false, manual: false, recentAvgActual: 200 }).active).toBe(true);
  });
  it("exits after three strong days, but not when turned on manually", () => {
    const strong = [d(150), d(160), d(170)];
    expect(evaluateRecovery({ days: strong, backlogMinutes: 0, dailyCapacity: 240, currentlyActive: true, manual: false, recentAvgActual: 160 })).toMatchObject({ active: false, changed: true });
    expect(evaluateRecovery({ days: strong, backlogMinutes: 0, dailyCapacity: 240, currentlyActive: true, manual: true, recentAvgActual: 160 }).active).toBe(true);
  });
});

describe("pace", () => {
  it("describes required vs current pace calmly", () => {
    const p = computePace({ today: "2026-09-26", examDate: "2026-11-07", totalUnits: 300, doneUnits: 180, unitsLast14: 20, questionsLast14: 1092, mocksLast28: 4, lastMockDate: "2026-09-20" });
    expect(p.daysLeft).toBe(42);
    expect(p.questions.current).toBe(78);
    expect(p.mocks.required).toBe(2);
    expect(p.summary).not.toMatch(/fail|danger|too late/i);
    expect(["AHEAD", "ON_TRACK", "SLIGHTLY_BEHIND", "BEHIND"]).toContain(p.syllabus.status);
  });
});

describe("streaks", () => {
  it("forgives one rest day per week", () => {
    const days = new Set(["2026-09-20", "2026-09-21", "2026-09-23", "2026-09-24", "2026-09-25"]);
    expect(currentStreak(days, "2026-09-26").streak).toBe(5);
    expect(bestStreak(days)).toBe(3);
  });
  it("breaks on two consecutive missed days", () => {
    const days = new Set(["2026-09-20", "2026-09-23", "2026-09-24"]);
    expect(currentStreak(days, "2026-09-25").streak).toBe(2);
  });
});

describe("benchmark", () => {
  it("enforces k-anonymity", () => {
    expect(aggregateValues([1, 2, 3])).toBeNull();
    const agg = aggregateValues(Array.from({ length: 25 }, (_, i) => i));
    expect(agg).toMatchObject({ value: 12, sampleSize: 25 });
  });
  it("labels reference benchmarks honestly", () => {
    const c = compareToBenchmark(74, { metric: "ACCURACY", value: 68, p25: 60, p75: 76, sampleSize: 0, source: "REFERENCE" }, "pp");
    expect(c.text).toBe("You are 6 percentage points above the benchmark median.");
    expect(c.label).toMatch(/illustrative/);
  });
});

describe("personal insights", () => {
  it("stays silent without enough data", () => {
    expect(computeInsights([{ localHour: 7, subjectName: "Maths", activeMinutes: 40, questions: 20, correct: 15, focusRating: 4, distractions: 0 }])).toEqual([]);
  });
  it("detects a real time-of-day difference", () => {
    const mk = (h: number, correct: number): SessionFact => ({ localHour: h, subjectName: "Maths", activeMinutes: 45, questions: 20, correct, focusRating: 4, distractions: 1 });
    const sessions = [...Array.from({ length: 6 }, () => mk(7, 17)), ...Array.from({ length: 6 }, () => mk(23, 12))];
    const ins = computeInsights(sessions);
    expect(ins.find((i) => i.kind === "TIME_OF_DAY")?.text).toMatch(/better in morning/);
    expect(ins.find((i) => i.kind === "SUBJECT_TIME")?.text).toMatch(/morning Maths sessions/);
  });
});

describe("goal cascade", () => {
  it("derives month, week and day from the exam goal", () => {
    const g = cascadeGoals({ today: "2026-09-26", examDate: "2026-12-26", dailyGoalMinutes: 240, weeklyGoalMinutes: 1500, topicsRemaining: 60 });
    expect(g.map((x) => x.level)).toEqual(["EXAM", "MONTHLY", "WEEKLY", "WEEKLY", "DAILY"]);
    expect(g[1].target).toBeLessThan(60);
    expect(g[3].target).toBeLessThanOrEqual(g[1].target);
  });
});
