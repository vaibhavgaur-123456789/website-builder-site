import { PRIORITY_WEIGHTS, type PriorityWeights } from "@/config/scoring";
import { diffDays } from "./dates";
import { clamp, round, smoothedAccuracy } from "./stats";

export type TopicStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface TopicSignals {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  /** 1..5 exam importance of the topic */
  weightage: number;
  /** subject weight relative to the heaviest subject of the exam, 0..1 */
  subjectShare: number;
  difficulty: number;
  status: TopicStatus;
  minutesStudied: number;
  estimatedMinutes: number;
  attempts: number;
  correct: number;
  /** attempts in the recent window (last 14 days) */
  recentAttempts: number;
  recentCorrect: number;
  /** attempts in the window before that (15–42 days ago) */
  previousAttempts: number;
  previousCorrect: number;
  nextRevisionOn: string | null;
  recentMistakes: number;
  /** minutes of unfinished work carried from earlier days */
  unfinishedMinutes: number;
  /** 0..1 how far the subject fell short of its planned time this week */
  subjectDeficit: number;
  recoveryStep: number;
  /** Onboarding self-assessment of the subject; only used until real attempts exist. */
  selfReported?: "WEAK" | "STRONG" | null;
}

export interface PriorityContext {
  today: string;
  examDate: string;
}

export type PriorityComponents = { [K in keyof PriorityWeights]: number };

export interface PriorityResult {
  score: number;
  components: PriorityComponents;
  reasons: string[];
}

const pctText = (v: number) => `${Math.round(v * 100)}%`;

export function scoreTopic(t: TopicSignals, ctx: PriorityContext, weights: PriorityWeights = PRIORITY_WEIGHTS): PriorityResult {
  const daysLeft = Math.max(0, diffDays(ctx.today, ctx.examDate));
  const reasons: string[] = [];

  // Importance: topic weightage dominates, subject share nudges.
  const importance = clamp(0.7 * ((t.weightage - 1) / 4) + 0.3 * t.subjectShare);

  // Weakness: unknown topics sit in the middle; measured accuracy below 85% raises it.
  const acc = smoothedAccuracy(t.correct, t.attempts);
  const prior = t.selfReported === "WEAK" ? 0.75 : t.selfReported === "STRONG" ? 0.3 : 0.5;
  const weakness = t.attempts === 0 ? prior : clamp((0.85 - acc) / 0.45);

  // Revision urgency.
  let revisionUrgency = 0;
  let overdue: number | null = null;
  if (t.nextRevisionOn) {
    overdue = diffDays(t.nextRevisionOn, ctx.today);
    if (overdue >= 0) revisionUrgency = clamp(0.6 + 0.1 * overdue);
  }

  const errorRate = clamp(t.recentMistakes / 10);

  const coverageFactor = t.status === "NOT_STARTED" ? 1 : t.status === "IN_PROGRESS" ? 0.6 : 0;
  const timePressure = daysLeft === 0 ? coverageFactor : clamp(1 - daysLeft / 120) * coverageFactor;

  // Trend: declining recent accuracy vs the previous window.
  let trend = 0;
  let recentAcc: number | null = null;
  let prevAcc: number | null = null;
  if (t.recentAttempts >= 5 && t.previousAttempts >= 5) {
    recentAcc = t.recentCorrect / t.recentAttempts;
    prevAcc = t.previousCorrect / t.previousAttempts;
    trend = clamp((prevAcc - recentAcc) / 0.2);
  }

  const unfinished = Math.max(clamp(t.unfinishedMinutes / 60), clamp(t.subjectDeficit));

  const components: PriorityComponents = {
    importance,
    weakness,
    revisionUrgency,
    errorRate,
    timePressure,
    trend,
    unfinished,
  };

  let total = 0;
  let wsum = 0;
  for (const k of Object.keys(weights) as (keyof PriorityWeights)[]) {
    total += weights[k] * components[k];
    wsum += weights[k];
  }
  const score = round(wsum > 0 ? total / wsum : 0, 3);

  // Human-readable reasons, most informative first.
  if (t.attempts >= 5 && weakness >= 0.35) reasons.push(`accuracy is ${pctText(t.correct / t.attempts)} over ${t.attempts} questions`);
  if (t.status === "NOT_STARTED") reasons.push("not started yet");
  if (t.attempts === 0 && t.selfReported === "WEAK") reasons.push(`you marked ${t.subjectName} as a weak subject`);
  if (t.recoveryStep > 0) reasons.push(`weak-topic recovery step ${t.recoveryStep} of 5`);
  if (importance >= 0.7) reasons.push("high-weightage topic");
  if (overdue !== null && overdue > 0) reasons.push(`revision is overdue by ${overdue} day${overdue === 1 ? "" : "s"}`);
  else if (overdue === 0) reasons.push("revision is due today");
  if (t.recentMistakes >= 3) reasons.push(`${t.recentMistakes} mistakes in the last 2 weeks`);
  if (trend >= 0.3 && recentAcc !== null && prevAcc !== null) reasons.push(`accuracy is declining (${pctText(prevAcc)} → ${pctText(recentAcc)})`);
  if (t.unfinishedMinutes > 0) reasons.push(`${t.unfinishedMinutes} min unfinished from an earlier day`);
  else if (t.subjectDeficit >= 0.3) reasons.push(`${t.subjectName} got less time than planned this week`);
  if (daysLeft <= 60 && t.status !== "COMPLETED") reasons.push(`you have ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`);

  return { score, components, reasons };
}

export type StudyTaskType = "STUDY" | "PRACTICE";

/** Which kind of block a topic needs next. */
export function suggestTaskType(t: Pick<TopicSignals, "status" | "minutesStudied" | "estimatedMinutes" | "recoveryStep">): StudyTaskType {
  if (t.recoveryStep === 1) return "STUDY";
  if (t.recoveryStep > 1) return "PRACTICE";
  if (t.status === "NOT_STARTED") return "STUDY";
  if (t.status === "IN_PROGRESS" && t.minutesStudied < t.estimatedMinutes * 0.6) return "STUDY";
  return "PRACTICE";
}
