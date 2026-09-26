import { INSIGHTS } from "@/config/scoring";
import { timeBucket, type TimeBucket } from "./dates";
import { mean, round } from "./stats";

export interface SessionFact {
  localHour: number;
  subjectName: string | null;
  activeMinutes: number;
  questions: number;
  correct: number;
  focusRating: number | null;
  distractions: number;
}

export interface Insight {
  kind: "TIME_OF_DAY" | "SUBJECT_TIME" | "SESSION_LENGTH" | "BEST_SUBJECT" | "WEAKEST_SUBJECT" | "DISTRACTION";
  text: string;
  sampleSize: number;
}

const bucketLabel: Record<TimeBucket, string> = { MORNING: "morning", AFTERNOON: "afternoon", EVENING: "evening", NIGHT: "late-night" };

interface Agg {
  sessions: number;
  q: number;
  c: number;
  minutes: number;
  distractions: number;
}
function aggregate(list: SessionFact[]): Agg {
  return list.reduce((a, s) => ({ sessions: a.sessions + 1, q: a.q + s.questions, c: a.c + s.correct, minutes: a.minutes + s.activeMinutes, distractions: a.distractions + s.distractions }), { sessions: 0, q: 0, c: 0, minutes: 0, distractions: 0 });
}
const enough = (a: Agg) => a.sessions >= INSIGHTS.minSessionsPerBucket && a.q >= INSIGHTS.minQuestionsPerBucket;

function compareBuckets(sessions: SessionFact[], scope: string | null): Insight | null {
  const groups = new Map<TimeBucket, SessionFact[]>();
  for (const s of sessions) {
    const b = timeBucket(s.localHour);
    groups.set(b, [...(groups.get(b) ?? []), s]);
  }
  const rated = [...groups.entries()].map(([b, l]) => ({ b, a: aggregate(l) })).filter((x) => enough(x.a)).map((x) => ({ ...x, acc: x.a.c / x.a.q }));
  if (rated.length < 2) return null;
  rated.sort((x, y) => y.acc - x.acc);
  const best = rated[0];
  const worst = rated[rated.length - 1];
  const rel = (best.acc - worst.acc) / worst.acc;
  if (rel < INSIGHTS.minRelativeDifference) return null;
  const subject = scope ? `${scope} ` : "";
  return {
    kind: scope ? "SUBJECT_TIME" : "TIME_OF_DAY",
    text: `You perform ${Math.round(rel * 100)}% better in ${bucketLabel[best.b]} ${subject}sessions (${Math.round(best.acc * 100)}% accuracy) than ${bucketLabel[worst.b]} ones (${Math.round(worst.acc * 100)}%).`,
    sampleSize: best.a.sessions + worst.a.sessions,
  };
}

/** Personal patterns, shown only when there is enough data to be meaningful. */
export function computeInsights(sessions: SessionFact[]): Insight[] {
  const out: Insight[] = [];
  const overall = compareBuckets(sessions, null);
  if (overall) out.push(overall);

  const bySubject = new Map<string, SessionFact[]>();
  for (const s of sessions) if (s.subjectName) bySubject.set(s.subjectName, [...(bySubject.get(s.subjectName) ?? []), s]);
  for (const [name, list] of bySubject) {
    const ins = compareBuckets(list, name);
    if (ins) out.push(ins);
  }

  if (sessions.length >= 10) {
    const lengths = sessions.map((s) => s.activeMinutes).sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    out.push({ kind: "SESSION_LENGTH", text: `Your typical focused session lasts ${Math.round(median)} min (average ${Math.round(mean(lengths))} min).`, sampleSize: sessions.length });
  }

  const subjAgg = [...bySubject.entries()].map(([n, l]) => ({ n, a: aggregate(l) })).filter((x) => x.a.q >= INSIGHTS.minQuestionsPerBucket).map((x) => ({ ...x, acc: x.a.c / x.a.q }));
  if (subjAgg.length >= 2) {
    subjAgg.sort((a, b) => b.acc - a.acc);
    const b = subjAgg[0];
    const w = subjAgg[subjAgg.length - 1];
    out.push({ kind: "BEST_SUBJECT", text: `Best-performing subject: ${b.n} (${Math.round(b.acc * 100)}% over ${b.a.q} questions).`, sampleSize: b.a.sessions });
    out.push({ kind: "WEAKEST_SUBJECT", text: `Weakest subject: ${w.n} (${Math.round(w.acc * 100)}% over ${w.a.q} questions).`, sampleSize: w.a.sessions });
  }

  const dGroups = new Map<TimeBucket, Agg>();
  for (const s of sessions) {
    const b = timeBucket(s.localHour);
    const a = dGroups.get(b) ?? { sessions: 0, q: 0, c: 0, minutes: 0, distractions: 0 };
    dGroups.set(b, { sessions: a.sessions + 1, q: a.q, c: a.c, minutes: a.minutes + s.activeMinutes, distractions: a.distractions + s.distractions });
  }
  const dRates = [...dGroups.entries()].filter(([, a]) => a.sessions >= INSIGHTS.minSessionsPerBucket && a.minutes > 0).map(([b, a]) => ({ b, rate: (a.distractions / a.minutes) * 60, n: a.sessions }));
  if (dRates.length >= 2) {
    dRates.sort((a, b) => b.rate - a.rate);
    if (dRates[0].rate >= 1) out.push({ kind: "DISTRACTION", text: `Most distractions happen in ${bucketLabel[dRates[0].b]} sessions (${round(dRates[0].rate, 1)} per hour).`, sampleSize: dRates[0].n });
  }
  return out;
}
