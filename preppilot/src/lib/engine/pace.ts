import { PLANNER } from "@/config/scoring";
import { diffDays } from "./dates";
import { round } from "./stats";

export interface PaceInput {
  today: string;
  examDate: string;
  /** weightage units (Σ topic weightage) */
  totalUnits: number;
  doneUnits: number;
  /** units completed in the last 14 days */
  unitsLast14: number;
  questionsLast14: number;
  mocksLast28: number;
  lastMockDate: string | null;
}

export type PaceStatus = "AHEAD" | "ON_TRACK" | "SLIGHTLY_BEHIND" | "BEHIND" | "NOT_ENOUGH_DATA";

export interface PaceMetric {
  label: string;
  unit: string;
  current: number;
  required: number;
  difference: number;
  status: PaceStatus;
  message: string;
}

export interface PaceResult {
  daysLeft: number;
  weeksLeft: number;
  phase: "BUILD" | "CONSOLIDATE" | "FINAL";
  syllabus: PaceMetric;
  questions: PaceMetric;
  mocks: PaceMetric;
  mockDueToday: boolean;
  summary: string;
}

function status(current: number, required: number): PaceStatus {
  if (required <= 0) return "AHEAD";
  const r = current / required;
  if (r >= 1.1) return "AHEAD";
  if (r >= 0.95) return "ON_TRACK";
  if (r >= 0.75) return "SLIGHTLY_BEHIND";
  return "BEHIND";
}

function metric(label: string, unit: string, current: number, required: number, dp: number, enoughData: boolean): PaceMetric {
  const c = round(current, dp);
  const r = round(required, dp);
  const diff = round(r - c, dp);
  const st = enoughData ? status(current, required) : "NOT_ENOUGH_DATA";
  const message =
    st === "NOT_ENOUGH_DATA"
      ? `Required pace: ${r} ${unit}. Your current pace appears after a few days of tracking.`
      : diff <= 0
        ? `You're at ${c} ${unit}, at or above the ${r} needed.`
        : `Current ${c} ${unit}, needed ${r}. Adding about ${diff} ${unit} closes the gap.`;
  return { label, unit, current: c, required: r, difference: diff, status: st, message };
}

export function requiredMocksPerWeek(daysLeft: number): number {
  if (daysLeft > 60) return 1;
  if (daysLeft > 30) return 2;
  if (daysLeft > 14) return 3;
  return 4;
}

/** Descriptive pace comparison: what's required vs what's happening. Never alarmist. */
export function computePace(i: PaceInput): PaceResult {
  const daysLeft = Math.max(0, diffDays(i.today, i.examDate));
  const weeksLeft = round(daysLeft / 7, 1);
  const learningDays = Math.max(1, Math.floor(daysLeft * (1 - PLANNER.finalRevisionShare)));
  const remaining = Math.max(0, i.totalUnits - i.doneUnits);
  const phase = daysLeft <= 14 ? "FINAL" : remaining / Math.max(1, i.totalUnits) < 0.2 ? "CONSOLIDATE" : "BUILD";

  const reqUnitsPerWeek = remaining > 0 ? (remaining / learningDays) * 7 : 0;
  const curUnitsPerWeek = i.unitsLast14 / 2;
  const reqQ = Math.max(30, (remaining * 12 + i.totalUnits * 4) / Math.max(1, daysLeft));
  const curQ = i.questionsLast14 / 14;
  const reqMocks = requiredMocksPerWeek(daysLeft);
  const curMocks = i.mocksLast28 / 4;
  const enough = i.questionsLast14 > 0 || i.unitsLast14 > 0;

  const syllabus = metric("Syllabus pace", "units/week", curUnitsPerWeek, reqUnitsPerWeek, 1, enough);
  const questions = metric("Practice pace", "questions/day", curQ, reqQ, 0, enough);
  const mocks = metric("Mock frequency", "mocks/week", curMocks, reqMocks, 1, true);

  const since = i.lastMockDate ? diffDays(i.lastMockDate, i.today) : Infinity;
  const mockDueToday = daysLeft > 0 && since >= Math.floor(7 / reqMocks);

  const behind = [syllabus, questions, mocks].filter((m) => m.status === "BEHIND" || m.status === "SLIGHTLY_BEHIND");
  const summary =
    daysLeft === 0
      ? "Exam day. Trust your preparation."
      : behind.length === 0
        ? `${daysLeft} days remaining. Your pace matches what the remaining syllabus needs.`
        : `${daysLeft} days remaining. ${behind.map((b) => b.label.toLowerCase()).join(" and ")} ${behind.length === 1 ? "is" : "are"} below the required pace. Small daily increases close this.`;

  return { daysLeft, weeksLeft, phase, syllabus, questions, mocks, mockDueToday, summary };
}
