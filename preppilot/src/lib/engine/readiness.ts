import { CONFIDENCE, READINESS_WEIGHTS, type ReadinessWeights } from "@/config/scoring";
import { clamp, round, slope } from "./stats";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type ReadinessKey = keyof ReadinessWeights;

export interface ReadinessInput {
  /** 0..1 weightage-weighted syllabus coverage */
  coverage: number;
  /** percent scores (0..100) of submitted mocks, oldest → newest */
  mockPercents: number[];
  /** practice + mock answers in the last 30 days */
  attempts30: number;
  correct30: number;
  /** revisions that fell due in the last 30 days, and how many were done within 1 day */
  revisionsDue30: number;
  revisionsOnTime30: number;
  /** qualifying study days in the last 14 days, and days since the student started (for new users) */
  activeDays14: number;
  daysSinceStart: number;
  /** weekly accuracy (0..1) for the last up to 4 weeks, oldest → newest; null = no data that week */
  weeklyAccuracy: (number | null)[];
  /** totals for confidence */
  totalMocks: number;
  totalQuestions: number;
  totalActiveDays: number;
}

export interface ReadinessComponent {
  key: ReadinessKey;
  label: string;
  value: number | null; // 0..100, null = not measured yet
  weight: number;
  explanation: string;
}

export interface ReadinessResult {
  score: number;
  components: ReadinessComponent[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  confidenceExplanation: string;
  measuredWeightShare: number;
}

export const READINESS_LABELS: Record<ReadinessKey, string> = {
  coverage: "Syllabus coverage",
  mock: "Mock performance",
  accuracy: "Accuracy",
  revision: "Revision health",
  consistency: "Consistency",
  trend: "Recent trend",
};

export function confidenceOf(totalMocks: number, totalQuestions: number, totalActiveDays: number) {
  const s =
    0.4 * Math.min(totalMocks / CONFIDENCE.mocksForFull, 1) +
    0.4 * Math.min(totalQuestions / CONFIDENCE.questionsForFull, 1) +
    0.2 * Math.min(totalActiveDays / CONFIDENCE.activeDaysForFull, 1);
  const level: ConfidenceLevel = s >= CONFIDENCE.high ? "HIGH" : s >= CONFIDENCE.medium ? "MEDIUM" : "LOW";
  const explanation = `Based on ${totalMocks} mock${totalMocks === 1 ? "" : "s"}, ${totalQuestions} questions and ${totalActiveDays} active day${totalActiveDays === 1 ? "" : "s"}.`;
  return { level, score: round(s, 2), explanation };
}

export function computeReadiness(i: ReadinessInput, weights: ReadinessWeights = READINESS_WEIGHTS): ReadinessResult {
  const c: Record<ReadinessKey, { value: number | null; explanation: string }> = {
    coverage: {
      value: round(clamp(i.coverage) * 100),
      explanation: "Share of the syllabus completed, weighted by topic importance. In-progress topics count half.",
    },
    mock: { value: null, explanation: "Take a mock test to measure this." },
    accuracy: { value: null, explanation: "Needs at least 20 answered questions in the last 30 days." },
    revision: { value: null, explanation: "No revisions have been due yet." },
    consistency: { value: null, explanation: "" },
    trend: { value: null, explanation: "Needs at least 2 weeks of practice data." },
  };

  if (i.mockPercents.length > 0) {
    const recent = i.mockPercents.slice(-3).reverse(); // newest first
    const w = [0.5, 0.3, 0.2].slice(0, recent.length);
    const ws = w.reduce((a, b) => a + b, 0);
    const v = recent.reduce((s, p, k) => s + clamp(p, 0, 100) * w[k], 0) / ws;
    c.mock = { value: round(v), explanation: `Weighted average of your last ${recent.length} mock score${recent.length === 1 ? "" : "s"} (newest counts most).` };
  }
  if (i.attempts30 >= 20) {
    c.accuracy = { value: round((i.correct30 / i.attempts30) * 100), explanation: `${i.correct30} of ${i.attempts30} questions correct in the last 30 days.` };
  }
  if (i.revisionsDue30 > 0) {
    c.revision = { value: round((i.revisionsOnTime30 / i.revisionsDue30) * 100), explanation: `${i.revisionsOnTime30} of ${i.revisionsDue30} due revisions done on time (last 30 days).` };
  }
  const window = Math.max(1, Math.min(14, i.daysSinceStart + 1));
  c.consistency = { value: round(clamp(i.activeDays14 / window) * 100), explanation: `Studied at least 25 min on ${i.activeDays14} of the last ${window} days.` };

  const weeks = i.weeklyAccuracy.filter((x): x is number => x !== null);
  if (weeks.length >= 2) {
    const sl = slope(weeks); // accuracy change per week (0..1 units)
    c.trend = {
      value: round(clamp(50 + sl * 100 * 2.5, 0, 100)),
      explanation: `50 = flat. Accuracy moved ${sl >= 0 ? "+" : ""}${round(sl * 100, 1)} points per week over ${weeks.length} weeks.`,
    };
  }

  const components: ReadinessComponent[] = (Object.keys(weights) as ReadinessKey[]).map((key) => ({
    key,
    label: READINESS_LABELS[key],
    value: c[key].value,
    weight: weights[key],
    explanation: c[key].explanation,
  }));

  const measured = components.filter((x) => x.value !== null);
  const wsum = measured.reduce((s, x) => s + x.weight, 0);
  const totalW = components.reduce((s, x) => s + x.weight, 0);
  const score = wsum > 0 ? round(measured.reduce((s, x) => s + x.weight * (x.value as number), 0) / wsum) : 0;

  const conf = confidenceOf(i.totalMocks, i.totalQuestions, i.totalActiveDays);
  // Missing components cap confidence: a score built on half the evidence can't be "HIGH".
  const measuredShare = totalW > 0 ? wsum / totalW : 0;
  let level = conf.level;
  if (measuredShare < 0.6) level = "LOW";
  else if (measuredShare < 0.85 && level === "HIGH") level = "MEDIUM";

  return { score, components, confidence: level, confidenceScore: conf.score, confidenceExplanation: conf.explanation, measuredWeightShare: round(measuredShare, 2) };
}
