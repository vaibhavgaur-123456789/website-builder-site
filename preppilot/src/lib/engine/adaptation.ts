import { formatMinutes } from "./dates";
import { clamp } from "./stats";

export type Blocker = "TIME" | "LOW_ENERGY" | "PHONE" | "DIFFICULT_TOPIC" | "UNEXPECTED_WORK" | "OTHER";

export interface DayRecord {
  date: string;
  planned: number;
  actual: number;
  blocker: Blocker | null;
}

export interface SubjectRecord {
  subjectId: string;
  subjectName: string;
  planned: number;
  actual: number;
}

export interface AdaptationInput {
  days: DayRecord[]; // most recent 7 days (excluding today)
  subjects: SubjectRecord[];
  dailyMinutes: number;
  blockMinutes: number;
}

export interface AdaptationResult {
  capacityMultiplier: number;
  blockMinutes: number;
  easeIn: boolean;
  subjectDeficits: Record<string, number>;
  executionRatio: number | null;
  notes: string[];
}

/** Turns PLAN vs ACTUAL gaps and night-review blockers into concrete plan changes. */
export function adapt(input: AdaptationInput): AdaptationResult {
  const notes: string[] = [];
  let capacityMultiplier = 1;
  let blockMinutes = input.blockMinutes;
  let easeIn = false;

  const planned = input.days.filter((d) => d.planned > 0);
  let executionRatio: number | null = null;
  if (planned.length >= 3) {
    const p = planned.reduce((s, d) => s + d.planned, 0);
    const a = planned.reduce((s, d) => s + d.actual, 0);
    executionRatio = p > 0 ? a / p : null;
    if (executionRatio !== null && executionRatio < 0.8) {
      const avgActual = a / planned.length;
      const realistic = clamp(avgActual * 1.15, input.dailyMinutes * 0.5, input.dailyMinutes);
      capacityMultiplier = realistic / input.dailyMinutes;
      notes.push(
        `Your last ${planned.length} planned days averaged ${formatMinutes(avgActual)} of ${formatMinutes(p / planned.length)} planned. ` +
          `Today's plan is ${formatMinutes(realistic)}: a realistic stretch, not a reset.`,
      );
    } else if (executionRatio !== null && executionRatio >= 1.05 && planned.length >= 4) {
      notes.push("You've been doing more than planned. Consider raising your daily hours in Profile → Study settings.");
    }
  }

  const count = (b: Blocker) => input.days.filter((d) => d.blocker === b).length;
  if (count("LOW_ENERGY") >= 2) {
    blockMinutes = Math.max(25, blockMinutes - 15);
    notes.push(`Low energy came up ${count("LOW_ENERGY")} times, so blocks are shorter (${blockMinutes} min) with breaks.`);
  }
  if (count("PHONE") >= 2) {
    blockMinutes = Math.min(blockMinutes, 25);
    notes.push("Phone distraction came up repeatedly. Blocks are 25 min. Try Focus Mode with your phone in another room.");
  }
  if (count("DIFFICULT_TOPIC") >= 2) {
    easeIn = true;
    notes.push("Difficult topics stopped you recently, so weak topics now start with a short concept recap.");
  }
  if (count("TIME") + count("UNEXPECTED_WORK") >= 2) {
    capacityMultiplier = Math.min(capacityMultiplier, 0.9);
    notes.push("Time was tight on several days, so today's plan leaves more buffer.");
  }

  const subjectDeficits: Record<string, number> = {};
  let worst: SubjectRecord | null = null;
  let worstDef = 0;
  for (const s of input.subjects) {
    if (s.planned < 60) continue;
    const def = clamp((s.planned - s.actual) / s.planned);
    subjectDeficits[s.subjectId] = def;
    if (def > worstDef) {
      worstDef = def;
      worst = s;
    }
  }
  if (worst && worstDef >= 0.3) {
    notes.push(`${worst.subjectName} got ${formatMinutes(worst.actual)} of ${formatMinutes(worst.planned)} planned this week, so it gets a small priority boost.`);
  }

  return { capacityMultiplier, blockMinutes, easeIn, subjectDeficits, executionRatio, notes };
}
