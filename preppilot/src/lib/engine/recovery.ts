import { RECOVERY } from "@/config/scoring";

export interface RecoveryInput {
  /** most recent days with a plan, oldest → newest, excluding today */
  days: { date: string; planned: number; actual: number }[];
  backlogMinutes: number;
  dailyCapacity: number;
  currentlyActive: boolean;
  manual: boolean;
  /** realistic recent actual minutes/day */
  recentAvgActual: number;
}

export interface RecoveryDecision {
  active: boolean;
  changed: boolean;
  reason: string;
  capacityMinutes: number;
}

export function evaluateRecovery(i: RecoveryInput): RecoveryDecision {
  const recoveryCapacity = Math.max(30, Math.round(Math.min(i.dailyCapacity, Math.max(i.recentAvgActual, i.dailyCapacity * 0.4)) * RECOVERY.capacityFactor));
  const completion = (d: { planned: number; actual: number }) => (d.planned > 0 ? d.actual / d.planned : 1);

  if (i.currentlyActive) {
    const last = i.days.slice(-RECOVERY.exitDays);
    const recovered = !i.manual && last.length === RECOVERY.exitDays && last.every((d) => completion(d) >= RECOVERY.exitCompletion);
    if (recovered) {
      return { active: false, changed: true, reason: `${RECOVERY.exitDays} strong days in a row. You're back on your regular plan.`, capacityMinutes: i.dailyCapacity };
    }
    return { active: true, changed: false, reason: i.manual ? "Recovery mode is on (turned on by you)." : "Recovery mode continues until you have 3 days at 70%+ completion.", capacityMinutes: recoveryCapacity };
  }

  const window = i.days.slice(-RECOVERY.lookbackDays).filter((d) => d.planned > 0);
  const lowDays = window.filter((d) => completion(d) < RECOVERY.lowCompletion).length;
  if (lowDays >= RECOVERY.lowDaysToTrigger) {
    return { active: true, changed: true, reason: `${lowDays} of your last ${window.length} planned days were below 50% completion.`, capacityMinutes: recoveryCapacity };
  }
  if (i.backlogMinutes > i.dailyCapacity * RECOVERY.backlogFactor) {
    return { active: true, changed: true, reason: `Your backlog (${i.backlogMinutes} min) is more than 1.5 days of study.`, capacityMinutes: recoveryCapacity };
  }
  return { active: false, changed: false, reason: "", capacityMinutes: i.dailyCapacity };
}

export const RECOVERY_MESSAGE = "You are behind your original plan. We will not try to complete everything at once.";
