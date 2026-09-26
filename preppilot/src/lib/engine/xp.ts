import { XP } from "@/config/scoring";

export interface SessionClaim {
  /** device start time (may be earlier than serverStartedAt when replayed after being offline) */
  startedAt: Date;
  serverStartedAt: Date;
  endedAt: Date;
  now: Date;
  activeSeconds: number;
  breakSeconds: number;
  questionsAttempted: number;
  questionsCorrect: number;
  overlapsAnotherSession: boolean;
}

export interface ValidatedSession {
  activeSeconds: number;
  questionsAttempted: number;
  questionsCorrect: number;
  validated: boolean;
  flags: string[];
}

const TWELVE_HOURS = 12 * 3600 * 1000;

/** Anti-gaming: bound every claimed number by what physically could have happened. */
export function validateSession(c: SessionClaim): ValidatedSession {
  const flags: string[] = [];
  let start = c.startedAt.getTime();
  if (start < c.serverStartedAt.getTime() - TWELVE_HOURS) {
    start = c.serverStartedAt.getTime();
    flags.push("start time too far in the past, using server time");
  }
  if (start > c.now.getTime()) {
    start = c.serverStartedAt.getTime();
    flags.push("start time in the future, using server time");
  }
  const end = Math.min(c.endedAt.getTime(), c.now.getTime());
  const wall = Math.max(0, Math.floor((end - start) / 1000));

  let active = Math.max(0, Math.floor(c.activeSeconds));
  const maxActive = Math.max(0, wall - Math.max(0, c.breakSeconds));
  if (active > maxActive) {
    active = maxActive;
    flags.push("active time capped to elapsed time");
  }
  if (active > XP.maxSessionMinutes * 60) {
    active = XP.maxSessionMinutes * 60;
    flags.push(`session capped at ${XP.maxSessionMinutes} minutes`);
  }

  let attempted = Math.max(0, Math.floor(c.questionsAttempted));
  const maxQ = Math.floor((active / 60) * XP.maxQuestionsPerMinute);
  if (attempted > maxQ) {
    attempted = maxQ;
    flags.push("question count capped to a plausible pace");
  }
  const correct = Math.min(Math.max(0, Math.floor(c.questionsCorrect)), attempted);

  let validated = active >= XP.sessionMinActiveMinutes * 60;
  if (!validated) flags.push(`shorter than ${XP.sessionMinActiveMinutes} active minutes, no study XP`);
  if (c.overlapsAnotherSession) {
    validated = false;
    flags.push("overlaps another session, no study XP");
  }
  return { activeSeconds: active, questionsAttempted: attempted, questionsCorrect: correct, validated, flags };
}

export interface XpAward {
  type: "STUDY" | "QUESTIONS" | "CONSISTENCY" | "REVISION" | "MOCK" | "IMPROVEMENT" | "ACHIEVEMENT" | "CHALLENGE";
  amount: number;
  reason: string;
  dedupeKey: string;
}

/** Study + question XP for one validated session, respecting what was already earned today. */
export function sessionXp(
  s: { id: string; activeMinutes: number; correct: number; validated: boolean },
  earnedToday: { study: number; questions: number },
): XpAward[] {
  if (!s.validated) return [];
  const out: XpAward[] = [];
  const study = Math.max(0, Math.min(Math.floor(s.activeMinutes * XP.studyXpPerMinute), XP.studyXpDailyCap - earnedToday.study));
  if (study > 0) out.push({ type: "STUDY", amount: study, reason: `${Math.floor(s.activeMinutes)} focused minutes`, dedupeKey: `study:${s.id}` });
  const q = Math.max(0, Math.min(s.correct * XP.questionXpPerCorrect, XP.questionXpDailyCap - earnedToday.questions));
  if (q > 0) out.push({ type: "QUESTIONS", amount: q, reason: `${s.correct} correct answers`, dedupeKey: `questions:${s.id}` });
  return out;
}

export function mockXp(m: { attemptId: string; type: string; attemptRate: number; timeTakenSec: number; durationSec: number; attempted: number }): XpAward | null {
  const enoughTime = m.timeTakenSec >= m.durationSec * XP.mockMinTimeShare || m.timeTakenSec >= m.attempted * 30;
  if (m.attemptRate < XP.mockMinAttemptRate || !enoughTime) return null;
  const amount = XP.mockXp[m.type] ?? 20;
  return { type: "MOCK", amount, reason: "Mock test completed", dedupeKey: `mock:${m.attemptId}` };
}

export function consistencyXp(date: string, streak: number): XpAward {
  const bonus = Math.min(XP.streakBonusCap, Math.max(0, streak - 1) * XP.streakBonusPerDay);
  return { type: "CONSISTENCY", amount: XP.consistencyXp + bonus, reason: streak > 1 ? `Studied today (${streak}-day streak)` : "Studied today", dedupeKey: `consistency:${date}` };
}

export function revisionXp(revisionEventId: string): XpAward {
  return { type: "REVISION", amount: XP.revisionXp, reason: "Revision completed", dedupeKey: `revision:${revisionEventId}` };
}

// Levels: level n starts at 50·(n−1)² XP → 0, 50, 200, 450, 800, …
export function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const floor = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, xp, levelStart: floor, nextLevelAt: next, progress: (xp - floor) / (next - floor) };
}
