// Missed-task triage: every unfinished task gets exactly one explicit outcome. Nothing is silently deleted.

export type MissedAction = "RESCHEDULE" | "MERGE" | "REDUCE" | "POSTPONE" | "OPTIONAL";

export interface MissedTaskInput {
  type: string;
  topicId: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  completionPct: number;
  priorityScore: number;
  /** how many times this work has already been carried over */
  carryCount: number;
}

export interface TriageContext {
  /** topic ids already planned in the next 2 days */
  upcomingTopicIds: Set<string>;
}

export interface TriageResult {
  action: MissedAction;
  reason: string;
  /** minutes to carry forward (0 for MERGE/OPTIONAL-dropped) */
  carryMinutes: number;
  /** days from today to place the carried task */
  offsetDays: number;
}

export function triageMissedTask(t: MissedTaskInput, ctx: TriageContext): TriageResult {
  const remaining = Math.max(0, t.plannedMinutes - t.actualMinutes);

  if (t.completionPct >= 50 && remaining > 0) {
    return { action: "REDUCE", reason: `${t.completionPct}% done. Only the remaining ${remaining} min carries over.`, carryMinutes: remaining, offsetDays: 1 };
  }
  if (t.topicId && ctx.upcomingTopicIds.has(t.topicId)) {
    return { action: "MERGE", reason: "This topic is already planned in the next 2 days, so the work is merged there.", carryMinutes: 0, offsetDays: 0 };
  }
  if (t.carryCount >= 2) {
    return { action: "OPTIONAL", reason: "Carried over twice already. It's now optional so it can't keep crowding your plan.", carryMinutes: remaining, offsetDays: 1 };
  }
  if (t.type === "REVISION") {
    return { action: "RESCHEDULE", reason: "Revision timing matters for memory, so it moves to tomorrow.", carryMinutes: Math.min(remaining, 20), offsetDays: 1 };
  }
  if (t.priorityScore >= 0.6) {
    return { action: "RESCHEDULE", reason: "High-priority topic, moved to tomorrow.", carryMinutes: remaining, offsetDays: 1 };
  }
  if (t.priorityScore < 0.35) {
    return { action: "OPTIONAL", reason: "Lower priority right now, offered as optional.", carryMinutes: remaining, offsetDays: 1 };
  }
  return { action: "POSTPONE", reason: "Postponed a couple of days to keep tomorrow realistic.", carryMinutes: remaining, offsetDays: 2 };
}

/** Supportive completion message. Never shaming. */
export function completionMessage(pct: number): string {
  const p = Math.round(pct);
  if (p >= 100) return "You completed today's full plan. Excellent execution.";
  if (p >= 80) return `You completed ${p}% of today's plan. Strong day. The remaining ${100 - p}% is already handled.`;
  if (p > 0) return `You completed ${p}% of today's plan. Let's recover the remaining ${100 - p}% tomorrow.`;
  return "No study was recorded today. Tomorrow's plan is adjusted to be realistic. One focused block is a good restart.";
}
