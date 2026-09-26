import { REVISION } from "@/config/scoring";
import { addDays } from "./dates";
import { clamp } from "./stats";

export interface SrsState {
  srsStage: number;
  easeFactor: number;
  intervalDays: number;
  lapses: number;
  nextRevisionOn: string | null;
}

export type RevisionOutcome = "ADVANCED" | "HELD" | "LAPSED";

export function initialSrs(learnedOn: string): SrsState {
  return { srsStage: 0, easeFactor: REVISION.defaultEase, intervalDays: REVISION.intervals[0], lapses: 0, nextRevisionOn: addDays(learnedOn, REVISION.intervals[0]) };
}

/** recall: 1 = forgot, 2 = hard, 3 = good, 4 = easy */
export function reviewQuality(accuracy: number | null, recall: number | null): number {
  const fromRecall = recall === null ? null : ({ 1: 0.3, 2: 0.65, 3: 0.85, 4: 0.95 } as Record<number, number>)[recall] ?? 0.6;
  if (accuracy !== null && fromRecall !== null) return (accuracy + fromRecall) / 2;
  return accuracy ?? fromRecall ?? 0.6;
}

/**
 * Adaptive spaced repetition. Base ladder 1-3-7-14-30-60 days, stretched or shrunk by ease;
 * repeatedly-forgotten topics ("leeches") return sooner.
 */
export function applyReview(state: SrsState, quality: number, today: string): SrsState & { outcome: RevisionOutcome } {
  const ladder = REVISION.intervals;
  let { srsStage, easeFactor, lapses } = state;
  let outcome: RevisionOutcome;
  if (quality >= REVISION.advanceAccuracy) {
    outcome = "ADVANCED";
    srsStage = Math.min(srsStage + 1, ladder.length - 1);
    easeFactor += quality >= 0.9 ? 0.15 : 0.05;
  } else if (quality >= REVISION.holdAccuracy) {
    outcome = "HELD";
    easeFactor -= 0.05;
  } else {
    outcome = "LAPSED";
    srsStage = Math.max(0, srsStage - 2);
    lapses += 1;
    easeFactor -= 0.2;
  }
  easeFactor = clamp(easeFactor, REVISION.minEase, REVISION.maxEase);
  let interval = outcome === "LAPSED" ? 1 : Math.round(ladder[srsStage] * (easeFactor / REVISION.defaultEase));
  if (lapses >= REVISION.leechLapses) interval = Math.round(interval * REVISION.leechFactor);
  interval = Math.max(1, interval);
  return { srsStage, easeFactor: Math.round(easeFactor * 100) / 100, intervalDays: interval, lapses, nextRevisionOn: addDays(today, interval), outcome };
}
