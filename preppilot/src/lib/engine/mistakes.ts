export type MistakeCategory = "CONCEPTUAL" | "CALCULATION" | "CARELESS" | "TIME_MANAGEMENT" | "GUESSING" | "MEMORY";

export const MISTAKE_LABELS: Record<MistakeCategory, string> = {
  CONCEPTUAL: "Conceptual",
  CALCULATION: "Calculation",
  CARELESS: "Careless",
  TIME_MANAGEMENT: "Time management",
  GUESSING: "Guessing",
  MEMORY: "Memory",
};

export const MISTAKE_FIXES: Record<MistakeCategory, string> = {
  CONCEPTUAL: "Re-learn the concept from notes, then solve 5 easy questions before returning to exam-level ones.",
  CALCULATION: "Do 10 minutes of daily calculation drills (squares, tables, fractions↔percentages) and verify each step.",
  CARELESS: "Slow down on the last read: underline what is asked and re-check units and 'NOT/EXCEPT' words.",
  TIME_MANAGEMENT: "Use a 2-pass strategy: skip anything past about 90 s and return at the end.",
  GUESSING: "Only guess when you can eliminate at least 2 options, because negative marking punishes blind guesses.",
  MEMORY: "Add these facts to spaced revision and use active recall (cover and answer) instead of re-reading.",
};

export interface MistakeSignals {
  timeSpentSec: number;
  expectedSeconds: number;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  isQuantitative: boolean;
  isMemoryBased: boolean;
}

/** Heuristic first guess. The student can always correct it. */
export function categorizeMistake(s: MistakeSignals): MistakeCategory {
  const ratio = s.expectedSeconds > 0 ? s.timeSpentSec / s.expectedSeconds : 1;
  if (s.confidence === "LOW" && ratio < 0.5) return "GUESSING";
  if (ratio > 2) return "TIME_MANAGEMENT";
  if (s.confidence === "HIGH" && ratio < 0.6) return "CARELESS";
  if (s.isMemoryBased) return "MEMORY";
  if (s.isQuantitative && ratio >= 0.6) return "CALCULATION";
  if (s.confidence === "LOW") return "GUESSING";
  return "CONCEPTUAL";
}

export function topRecurring(categories: MistakeCategory[]): { category: MistakeCategory; count: number; share: number; message: string; fix: string } | null {
  if (categories.length === 0) return null;
  const counts = new Map<MistakeCategory, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const [category, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = count / categories.length;
  return {
    category,
    count,
    share,
    message: `Your top recurring mistake is ${MISTAKE_LABELS[category].toLowerCase()} (${count} of ${categories.length}, ${Math.round(share * 100)}%).`,
    fix: MISTAKE_FIXES[category],
  };
}
