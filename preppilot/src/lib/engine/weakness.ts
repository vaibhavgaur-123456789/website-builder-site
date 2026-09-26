import { ACCURACY } from "@/config/scoring";
import { smoothedAccuracy } from "./stats";

export type Trend = "IMPROVING" | "STABLE" | "DECLINING" | "UNKNOWN";

export interface WeaknessInput {
  attempts: number;
  correct: number;
  recentAttempts: number;
  recentCorrect: number;
  previousAttempts: number;
  previousCorrect: number;
  /** 1..5 */
  weightage: number;
}

export interface WeaknessResult {
  isWeak: boolean;
  priority: "HIGH" | "MEDIUM" | null;
  accuracy: number | null;
  smoothed: number;
  trend: Trend;
  reasons: string[];
}

export function trendOf(i: Pick<WeaknessInput, "recentAttempts" | "recentCorrect" | "previousAttempts" | "previousCorrect">): Trend {
  if (i.recentAttempts < 5 || i.previousAttempts < 5) return "UNKNOWN";
  const d = i.recentCorrect / i.recentAttempts - i.previousCorrect / i.previousAttempts;
  if (d <= -ACCURACY.decliningDelta) return "DECLINING";
  if (d >= ACCURACY.decliningDelta) return "IMPROVING";
  return "STABLE";
}

export function assessWeakness(i: WeaknessInput): WeaknessResult {
  const accuracy = i.attempts > 0 ? i.correct / i.attempts : null;
  const smoothed = smoothedAccuracy(i.correct, i.attempts);
  const trend = trendOf(i);
  const reasons: string[] = [];
  if (i.attempts < ACCURACY.minAttemptsForWeakness) {
    return { isWeak: false, priority: null, accuracy, smoothed, trend, reasons: ["not enough attempts to judge yet"] };
  }
  const low = smoothed < ACCURACY.weakThreshold;
  const declining = trend === "DECLINING";
  if (low) reasons.push(`accuracy ${Math.round((accuracy ?? 0) * 100)}% over ${i.attempts} attempts`);
  if (declining) reasons.push("recent accuracy is declining");
  const isWeak = low || (declining && smoothed < 0.75);
  if (!isWeak) return { isWeak: false, priority: null, accuracy, smoothed, trend, reasons };
  const high = smoothed < ACCURACY.highPriorityThreshold || (i.weightage >= 4 && low) || (low && declining);
  if (i.weightage >= 4) reasons.push("high-weightage topic");
  return { isWeak, priority: high ? "HIGH" : "MEDIUM", accuracy, smoothed, trend, reasons };
}

/** The 5-step recovery pathway for a weak topic. */
export const PATHWAY = [
  { step: 1, name: "Concept revision", minutes: 30, questions: 5, difficultyMax: 2, objective: (t: string, q: number) => `Re-learn the core idea of ${t} from your notes, then solve ${q} worked examples.` },
  { step: 2, name: "Easy questions", minutes: 30, questions: 15, difficultyMax: 2, objective: (t: string, q: number) => `Solve ${q} easy ${t} questions. Aim for 80%+ accuracy.` },
  { step: 3, name: "Medium questions", minutes: 40, questions: 15, difficultyMax: 3, objective: (t: string, q: number) => `Solve ${q} medium ${t} questions. Write the method for each.` },
  { step: 4, name: "Timed practice", minutes: 30, questions: 20, difficultyMax: 4, objective: (t: string, q: number) => `${q} ${t} questions against the clock (about 90 s each).` },
  { step: 5, name: "Re-test", minutes: 20, questions: 15, difficultyMax: 5, objective: (t: string, q: number) => `Take a ${q}-question ${t} topic test to confirm recovery.` },
] as const;

/**
 * Move along the pathway based on the accuracy achieved in the current step.
 * Returns the next step (0 = recovered / pathway finished).
 */
export function nextPathwayStep(current: number, stepAccuracy: number): { step: number; message: string } {
  if (current <= 0) return { step: 0, message: "" };
  if (current === 5) {
    return stepAccuracy >= 0.75
      ? { step: 0, message: "Re-test passed. This topic is no longer flagged as weak." }
      : { step: 3, message: "Re-test below 75%. Back to medium questions for one more round." };
  }
  if (current === 1) return { step: 2, message: "Concept refreshed. Next: easy questions." };
  if (stepAccuracy >= 0.7) return { step: current + 1, message: `Step ${current} cleared (${Math.round(stepAccuracy * 100)}%). Next: ${PATHWAY[current].name}.` };
  if (stepAccuracy < 0.5) return { step: Math.max(1, current - 1), message: "Accuracy was low, so we'll step back once to rebuild the foundation." };
  return { step: current, message: "Close. Repeat this step once more." };
}
