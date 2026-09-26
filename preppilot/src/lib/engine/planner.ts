import { PLANNER, REVISION } from "@/config/scoring";
import { toHHMM, toMinutes } from "./dates";
import { PATHWAY } from "./weakness";

export type TaskType = "STUDY" | "PRACTICE" | "REVISION" | "MOCK" | "MOCK_ANALYSIS" | "MISTAKE_REVIEW" | "CUSTOM";
export type Slot = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
export const ALL_SLOTS: Slot[] = ["MORNING", "AFTERNOON", "EVENING", "NIGHT"];

export interface PlanCandidate {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  score: number;
  reasons: string[];
  taskType: "STUDY" | "PRACTICE";
  /** minutes still needed to finish first-pass study (STUDY) – ignored for PRACTICE */
  remainingMinutes: number;
  recoveryStep: number;
  isWeak: boolean;
}

export interface DueRevision {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  overdueDays: number;
  stage: number;
}

export interface CarryOver {
  title: string;
  type: TaskType;
  topicId: string | null;
  subjectId: string | null;
  minutes: number;
  questionTarget: number;
  objective: string;
  reasons: string[];
  carriedFromId: string;
  priority: number;
  optional: boolean;
}

export interface PlanInput {
  capacityMinutes: number;
  slots: Slot[];
  blockMinutes: number;
  candidates: PlanCandidate[];
  revisionsDue: DueRevision[];
  carryOvers: CarryOver[];
  unresolvedMistakes: number;
  mock: { mockId: string; title: string; minutes: number; reason: string } | null;
  pendingMockAnalysis: { attemptId: string; title: string } | null;
  mode: "NORMAL" | "RECOVERY";
  /** Last stretch before the exam: prefer practice/revision over new topics. */
  finalPhase: boolean;
  /** 0..1 – candidates below this score are skipped (recovery mode focuses on high value) */
  minScore?: number;
  /** Start weak/difficult topics with concept revision (from night-review blockers). */
  easeIn?: boolean;
  /** Local minutes since midnight; no block may start earlier (used when planning mid-day). */
  notBefore?: number;
}

export interface PlannedTask {
  type: TaskType;
  title: string;
  topicId: string | null;
  subjectId: string | null;
  mockId: string | null;
  plannedMinutes: number;
  questionTarget: number;
  objective: string;
  reasons: string[];
  priorityScore: number;
  startTime: string | null;
  order: number;
  source: "AUTO" | "CARRY_OVER" | "RECOVERY";
  isOptional: boolean;
  carriedFromId: string | null;
}

export interface PlanOutput {
  tasks: PlannedTask[];
  plannedMinutes: number;
  dropped: { title: string; reason: string }[];
  notes: string[];
}

const qTarget = (type: TaskType, minutes: number) => Math.round(minutes * (PLANNER.questionsPerMinute[type] ?? 0));

function studyObjective(c: PlanCandidate, minutes: number, easeIn: boolean): { title: string; objective: string; q: number } {
  if (c.recoveryStep > 0) {
    const step = PATHWAY[c.recoveryStep - 1];
    const q = step.questions;
    return { title: `${c.subjectName} — ${c.topicName}: ${step.name}`, objective: step.objective(c.topicName, q), q };
  }
  if (c.taskType === "STUDY") {
    const q = qTarget("STUDY", minutes);
    const lead = easeIn && c.isWeak ? "Start with a 10-minute concept recap, then learn" : "Learn";
    return { title: `${c.subjectName} — ${c.topicName}`, objective: `${lead} the core concepts of ${c.topicName} and solve ${q} worked examples.`, q };
  }
  const q = qTarget("PRACTICE", minutes);
  return { title: `${c.subjectName} — ${c.topicName} practice`, objective: `Solve ${q} questions on ${c.topicName}. Note every mistake.`, q };
}

/** Build a feasible, time-slotted plan for one day. Pure and deterministic. */
export function buildDayPlan(input: PlanInput): PlanOutput {
  const notes: string[] = [];
  const dropped: PlanOutput["dropped"] = [];
  const picked: PlannedTask[] = [];
  let budget = Math.max(0, Math.round(input.capacityMinutes));
  const block = Math.min(PLANNER.maxBlock, Math.max(PLANNER.minBlock, input.blockMinutes));
  const source = input.mode === "RECOVERY" ? "RECOVERY" : "AUTO";

  const take = (t: Omit<PlannedTask, "startTime" | "order">) => {
    picked.push({ ...t, startTime: null, order: 0 });
    budget -= t.plannedMinutes;
  };

  // 1. Mock test (exam simulation) — only if it fits.
  if (input.mock) {
    if (input.mock.minutes <= budget) {
      take({
        type: "MOCK", title: input.mock.title, topicId: null, subjectId: null, mockId: input.mock.mockId,
        plannedMinutes: input.mock.minutes, questionTarget: 0,
        objective: "Attempt under exam conditions. No pausing, no notes.",
        reasons: [input.mock.reason], priorityScore: 0.9, source, isOptional: false, carriedFromId: null,
      });
    } else {
      dropped.push({ title: input.mock.title, reason: "does not fit in today's available time" });
    }
  }

  // 2. Analysis of the last mock — insight is lost if analysis is skipped.
  if (input.pendingMockAnalysis && budget >= PLANNER.mockAnalysisMinutes) {
    take({
      type: "MOCK_ANALYSIS", title: `Analyse: ${input.pendingMockAnalysis.title}`, topicId: null, subjectId: null, mockId: null,
      plannedMinutes: PLANNER.mockAnalysisMinutes, questionTarget: 0,
      objective: "Review every wrong and skipped question, confirm mistake categories, note 3 fixes.",
      reasons: ["your last mock has not been analysed yet"], priorityScore: 0.85, source, isOptional: false, carriedFromId: null,
    });
  }

  // 3. Due revisions, most overdue first, capped at a share of the day.
  const revCap = Math.max(REVISION.minutesPerRevision, Math.floor(input.capacityMinutes * REVISION.maxRevisionShareOfDay));
  let revUsed = 0;
  const revs = [...input.revisionsDue].sort((a, b) => b.overdueDays - a.overdueDays);
  for (const r of revs) {
    const m = REVISION.minutesPerRevision;
    if (revUsed + m > revCap || m > budget) {
      dropped.push({ title: `Revise ${r.topicName}`, reason: "revision time for today is full; it stays due" });
      continue;
    }
    take({
      type: "REVISION", title: `Revise: ${r.subjectName} — ${r.topicName}`, topicId: r.topicId, subjectId: r.subjectId, mockId: null,
      plannedMinutes: m, questionTarget: qTarget("REVISION", m),
      objective: `Recall key formulas/facts of ${r.topicName}, then solve ${qTarget("REVISION", m)} quick questions.`,
      reasons: [r.overdueDays > 0 ? `revision is overdue by ${r.overdueDays} day${r.overdueDays === 1 ? "" : "s"}` : "revision is due today", `spaced-revision stage ${r.stage + 1}`],
      priorityScore: 0.8, source, isOptional: false, carriedFromId: null,
    });
    revUsed += m;
  }

  // 4. Carry-overs (rescheduled/reduced work), bounded so they cannot swallow the day.
  const carryCap = Math.floor(input.capacityMinutes * 0.4);
  let carryUsed = 0;
  const carriedTopics = new Set<string>();
  for (const c of [...input.carryOvers].sort((a, b) => b.priority - a.priority)) {
    const m = Math.min(c.minutes, budget);
    if (m < PLANNER.minBlock || carryUsed + m > carryCap) {
      dropped.push({ title: c.title, reason: "kept in the backlog to avoid overloading today" });
      continue;
    }
    take({
      type: c.type, title: c.title, topicId: c.topicId, subjectId: c.subjectId, mockId: null, plannedMinutes: m,
      questionTarget: c.minutes > 0 ? Math.round((c.questionTarget * m) / c.minutes) : 0, objective: c.objective,
      reasons: ["carried over from an earlier day", ...c.reasons.slice(0, 2)], priorityScore: c.priority,
      source: "CARRY_OVER", isOptional: c.optional, carriedFromId: c.carriedFromId,
    });
    carryUsed += m;
    if (c.topicId) carriedTopics.add(c.topicId);
  }

  // 5. Mistake review.
  if (input.unresolvedMistakes >= PLANNER.mistakeReviewThreshold && budget >= PLANNER.mistakeReviewMinutes) {
    take({
      type: "MISTAKE_REVIEW", title: "Mistake book review", topicId: null, subjectId: null, mockId: null,
      plannedMinutes: PLANNER.mistakeReviewMinutes, questionTarget: Math.min(10, input.unresolvedMistakes),
      objective: "Re-solve your oldest unresolved mistakes without looking at the solution first.",
      reasons: [`${input.unresolvedMistakes} unresolved mistakes in your mistake book`], priorityScore: 0.7, source, isOptional: false, carriedFromId: null,
    });
  }

  // 6. Study / practice blocks by priority, with subject diversity.
  const minScore = input.minScore ?? 0;
  const perSubject = new Map<string, number>();
  const usedTopics = new Set<string>(carriedTopics);
  const ranked = [...input.candidates].sort((a, b) => b.score - a.score);
  let skippedLow = 0;
  const tryPlace = (c: PlanCandidate, maxPerSubject: number) => {
    if (usedTopics.has(c.topicId) || budget < PLANNER.minBlock) return;
    if ((perSubject.get(c.subjectId) ?? 0) >= maxPerSubject) return;
    if (input.finalPhase && c.taskType === "STUDY" && !c.isWeak && c.recoveryStep === 0) return;
    const want = c.taskType === "STUDY" && c.recoveryStep === 0 ? Math.min(block, Math.max(PLANNER.minBlock, c.remainingMinutes)) : block;
    const m = Math.min(want, budget);
    if (m < PLANNER.minBlock) return;
    const o = studyObjective(c, m, !!input.easeIn);
    take({
      type: c.taskType, title: o.title, topicId: c.topicId, subjectId: c.subjectId, mockId: null, plannedMinutes: m,
      questionTarget: o.q, objective: o.objective, reasons: c.reasons.slice(0, 4), priorityScore: c.score,
      source, isOptional: false, carriedFromId: null,
    });
    usedTopics.add(c.topicId);
    perSubject.set(c.subjectId, (perSubject.get(c.subjectId) ?? 0) + 1);
  };
  const eligible = ranked.filter((c) => {
    if (c.score < minScore) {
      skippedLow++;
      return false;
    }
    return true;
  });
  for (const c of eligible) tryPlace(c, 2);
  for (const c of eligible) tryPlace(c, 99); // relax diversity only if time remains

  if (input.mode === "RECOVERY" && skippedLow > 0) {
    notes.push(`Recovery mode: ${skippedLow} lower-priority topic${skippedLow === 1 ? " is" : "s are"} paused so you can focus on what matters most.`);
  }
  if (budget >= PLANNER.minBlock && eligible.length > 0) {
    notes.push(`${budget} min left unplanned. Use it as a buffer or add a task.`);
  }

  // 7. Order: mock first (fresh mind), then hardest/highest-priority learning, revision, practice, reviews last.
  const rank: Record<TaskType, number> = { MOCK: 0, STUDY: 1, REVISION: 2, PRACTICE: 3, CUSTOM: 3, MISTAKE_REVIEW: 4, MOCK_ANALYSIS: 5 };
  picked.sort((a, b) => rank[a.type] - rank[b.type] || b.priorityScore - a.priorityScore);

  const timed = assignTimes(picked, input.slots, input.notBefore);
  const placed = timed.filter((t) => t.startTime !== null);
  const unplaced = timed.filter((t) => t.startTime === null);
  for (const t of unplaced) dropped.push({ title: t.title, reason: "no free time window left today" });
  if (unplaced.length > 0) notes.push(`${unplaced.length} block${unplaced.length === 1 ? "" : "s"} didn't fit in the hours left today and will be reconsidered tomorrow.`);
  placed.forEach((t, i) => (t.order = i));

  return { tasks: placed, plannedMinutes: placed.reduce((s, t) => s + t.plannedMinutes, 0), dropped, notes };
}

/** Lay tasks into the student's preferred windows with breaks between them. */
export function assignTimes<T extends { plannedMinutes: number; startTime: string | null }>(tasks: T[], slots: Slot[], notBefore?: number): T[] {
  const preferred = slots.length ? slots : (["MORNING", "EVENING"] as Slot[]);
  const order = [...preferred, ...ALL_SLOTS.filter((s) => !preferred.includes(s))];
  const earliest = notBefore === undefined ? 0 : Math.ceil(notBefore / 5) * 5;
  const windows = order
    .map((s) => ({ start: toMinutes(PLANNER.slotStarts[s]), end: toMinutes(PLANNER.slotEnds[s]) }))
    .map((w) => ({ ...w, cursor: Math.max(w.start, earliest) }));
  // Fill preferred windows in chronological order so the day reads naturally.
  const prefWindows = windows.slice(0, preferred.length).sort((a, b) => a.start - b.start);
  const fallback = windows.slice(preferred.length).sort((a, b) => a.start - b.start);
  const all = [...prefWindows, ...fallback];

  return tasks.map((t) => {
    for (const w of all) {
      if (w.cursor + t.plannedMinutes <= w.end) {
        const start = w.cursor;
        w.cursor += t.plannedMinutes + PLANNER.breakMinutes;
        return { ...t, startTime: toHHMM(start) };
      }
    }
    return { ...t, startTime: null };
  });
}

export interface PlanValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Guards against impossible schedules when the student edits the plan by hand. */
export function validatePlan(
  tasks: { id?: string; title: string; startTime: string | null; plannedMinutes: number; status?: string }[],
  capacityMinutes: number,
): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const active = tasks.filter((t) => t.status !== "SKIPPED");
  for (const t of active) {
    if (t.plannedMinutes <= 0) errors.push(`"${t.title}" needs a duration.`);
    if (t.plannedMinutes > PLANNER.maxTaskMinutes) errors.push(`"${t.title}" is longer than ${PLANNER.maxTaskMinutes} minutes. Split it into smaller blocks.`);
    if (t.startTime && toMinutes(t.startTime) + t.plannedMinutes > 24 * 60) errors.push(`"${t.title}" runs past midnight.`);
  }
  const timed = active.filter((t) => t.startTime).sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    const cur = timed[i];
    if (toMinutes(prev.startTime!) + prev.plannedMinutes > toMinutes(cur.startTime!)) {
      errors.push(`"${prev.title}" overlaps with "${cur.title}".`);
    }
  }
  const total = active.reduce((s, t) => s + t.plannedMinutes, 0);
  if (capacityMinutes > 0 && total > capacityMinutes * PLANNER.overloadTolerance) {
    errors.push(`This plan needs ${total} min, but you have about ${capacityMinutes} min available today. Remove or shorten a task.`);
  } else if (total > capacityMinutes) {
    warnings.push(`This plan is ${total - capacityMinutes} min over your available time. That's fine occasionally, but hard to sustain.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
