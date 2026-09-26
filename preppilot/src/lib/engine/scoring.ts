import { DAILY_SCORE_WEIGHTS } from "@/config/scoring";
import { clamp, round } from "./stats";

export interface DayActivity {
  plannedMinutes: number;
  actualMinutes: number;
  tasksPlanned: number;
  tasksDone: number;
  focusRatings: number[]; // 1..5
  distractions: number;
  revisionsDue: number;
  revisionsDone: number;
  testPlanned: boolean;
  testDone: boolean;
  questions: number;
  correct: number;
}

export interface DailyScore {
  execution: number | null;
  focus: number | null;
  revision: number | null;
  testing: number | null;
  daily: number | null;
  completionPct: number;
}

export function computeDailyScore(d: DayActivity): DailyScore {
  const completionPct = d.plannedMinutes > 0 ? round(clamp(d.actualMinutes / d.plannedMinutes) * 100) : d.actualMinutes > 0 ? 100 : 0;

  const execution =
    d.plannedMinutes > 0
      ? round(100 * clamp(0.7 * clamp(d.actualMinutes / d.plannedMinutes) + 0.3 * (d.tasksPlanned > 0 ? d.tasksDone / d.tasksPlanned : 0)))
      : null;

  const focus =
    d.focusRatings.length > 0
      ? round(clamp((d.focusRatings.reduce((a, b) => a + b, 0) / d.focusRatings.length) / 5 - Math.min(0.3, d.distractions * 0.03)) * 100)
      : null;

  const revision = d.revisionsDue > 0 ? round(clamp(d.revisionsDone / d.revisionsDue) * 100) : null;

  const testing = d.testPlanned ? (d.testDone ? 100 : 0) : d.questions >= 10 ? round((d.correct / d.questions) * 100) : null;

  const parts: [number | null, number][] = [
    [execution, DAILY_SCORE_WEIGHTS.execution],
    [focus, DAILY_SCORE_WEIGHTS.focus],
    [revision, DAILY_SCORE_WEIGHTS.revision],
    [testing, DAILY_SCORE_WEIGHTS.testing],
  ];
  const measured = parts.filter(([v]) => v !== null) as [number, number][];
  const ws = measured.reduce((s, [, w]) => s + w, 0);
  const daily = ws > 0 ? round(measured.reduce((s, [v, w]) => s + v * w, 0) / ws) : null;

  return { execution, focus, revision, testing, daily, completionPct };
}
