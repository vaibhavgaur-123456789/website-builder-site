import { round } from "./stats";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface MockQuestionInfo {
  questionId: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  correctIndex: number;
  marks: number;
  expectedSeconds: number;
  difficulty: number;
}

export interface MockAnswer {
  selected: number | null;
  timeSpentSec: number;
  confidence: Confidence | null;
}

export interface Breakdown {
  id: string;
  name: string;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  maxScore: number;
  accuracy: number | null;
  timeSec: number;
}

export interface QuestionResult {
  questionId: string;
  topicId: string;
  subjectId: string;
  selected: number | null;
  isCorrect: boolean;
  skipped: boolean;
  timeSpentSec: number;
  confidence: Confidence | null;
  expectedSeconds: number;
}

export interface MockResult {
  score: number;
  maxScore: number;
  percent: number;
  correct: number;
  wrong: number;
  skipped: number;
  attempted: number;
  accuracy: number | null;
  attemptRate: number;
  avgTimePerQuestion: number;
  bySubject: Breakdown[];
  byTopic: Breakdown[];
  time: { overTime: number; fastWrong: number; slowCorrect: number };
  confidenceMatrix: Record<Confidence | "NONE", { correct: number; wrong: number }>;
  overconfident: string[];
  underconfident: string[];
  questions: QuestionResult[];
  insights: string[];
}

/**
 * Score a mock on the server. negativeRatio = marks deducted per wrong answer as a fraction of the
 * question's marks (e.g. SSC: 0.5 of 2 marks → 0.25).
 */
export function scoreMock(questions: MockQuestionInfo[], answers: Record<string, MockAnswer | undefined>, negativeRatio: number): MockResult {
  const subj = new Map<string, Breakdown>();
  const top = new Map<string, Breakdown>();
  const matrix: MockResult["confidenceMatrix"] = { HIGH: { correct: 0, wrong: 0 }, MEDIUM: { correct: 0, wrong: 0 }, LOW: { correct: 0, wrong: 0 }, NONE: { correct: 0, wrong: 0 } };
  const overconfident: string[] = [];
  const underconfident: string[] = [];
  const results: QuestionResult[] = [];
  let score = 0, maxScore = 0, correct = 0, wrong = 0, skipped = 0, totalTime = 0;
  let overTime = 0, fastWrong = 0, slowCorrect = 0;

  const bucket = (m: Map<string, Breakdown>, id: string, name: string) => {
    let b = m.get(id);
    if (!b) {
      b = { id, name, total: 0, correct: 0, wrong: 0, skipped: 0, score: 0, maxScore: 0, accuracy: null, timeSec: 0 };
      m.set(id, b);
    }
    return b;
  };

  for (const q of questions) {
    const a = answers[q.questionId];
    const selected = a && a.selected !== null && a.selected !== undefined ? a.selected : null;
    const time = Math.max(0, Math.round(a?.timeSpentSec ?? 0));
    const conf = a?.confidence ?? null;
    const isSkipped = selected === null;
    const isCorrect = !isSkipped && selected === q.correctIndex;
    const delta = isSkipped ? 0 : isCorrect ? q.marks : -q.marks * negativeRatio;

    maxScore += q.marks;
    score += delta;
    totalTime += time;
    if (isSkipped) skipped++;
    else if (isCorrect) correct++;
    else wrong++;

    for (const b of [bucket(subj, q.subjectId, q.subjectName), bucket(top, q.topicId, q.topicName)]) {
      b.total++;
      b.maxScore += q.marks;
      b.score += delta;
      b.timeSec += time;
      if (isSkipped) b.skipped++;
      else if (isCorrect) b.correct++;
      else b.wrong++;
    }

    if (!isSkipped) {
      matrix[conf ?? "NONE"][isCorrect ? "correct" : "wrong"]++;
      if (conf === "HIGH" && !isCorrect) overconfident.push(q.questionId);
      if (conf === "LOW" && isCorrect) underconfident.push(q.questionId);
      if (time > q.expectedSeconds * 2) overTime++;
      if (!isCorrect && time < q.expectedSeconds * 0.35) fastWrong++;
      if (isCorrect && time > q.expectedSeconds * 1.5) slowCorrect++;
    }
    results.push({ questionId: q.questionId, topicId: q.topicId, subjectId: q.subjectId, selected, isCorrect, skipped: isSkipped, timeSpentSec: time, confidence: conf, expectedSeconds: q.expectedSeconds });
  }

  const fin = (m: Map<string, Breakdown>) =>
    [...m.values()].map((b) => ({ ...b, score: round(b.score, 2), accuracy: b.correct + b.wrong > 0 ? round(b.correct / (b.correct + b.wrong), 3) : null }));

  const attempted = correct + wrong;
  const accuracy = attempted > 0 ? round(correct / attempted, 3) : null;
  const attemptRate = questions.length > 0 ? round(attempted / questions.length, 3) : 0;
  const bySubject = fin(subj);
  const byTopic = fin(top);

  const insights: string[] = [];
  if (overconfident.length > 0) insights.push(`${overconfident.length} answer${overconfident.length === 1 ? " was" : "s were"} wrong despite high confidence. Check these for concept gaps or traps.`);
  if (underconfident.length > 0) insights.push(`${underconfident.length} correct answer${underconfident.length === 1 ? " was" : "s were"} marked low-confidence. This knowledge needs strengthening.`);
  if (fastWrong >= 2) insights.push(`${fastWrong} wrong answers came very quickly, a sign of careless or guessed attempts.`);
  if (overTime >= 2) insights.push(`${overTime} questions took more than twice the expected time. Practise skipping earlier.`);
  if (attemptRate < 0.6 && questions.length >= 10) insights.push(`You attempted ${Math.round(attemptRate * 100)}% of questions. Selective attempting is fine if accuracy stays high.`);
  const weakest = bySubject.filter((b) => b.accuracy !== null && b.correct + b.wrong >= 3).sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1))[0];
  if (weakest && (weakest.accuracy ?? 1) < 0.6) insights.push(`${weakest.name} had the lowest accuracy (${Math.round((weakest.accuracy ?? 0) * 100)}%).`);

  return {
    score: round(score, 2),
    maxScore,
    percent: maxScore > 0 ? round((Math.max(0, score) / maxScore) * 100, 1) : 0,
    correct,
    wrong,
    skipped,
    attempted,
    accuracy,
    attemptRate,
    avgTimePerQuestion: attempted > 0 ? round(totalTime / Math.max(1, attempted + skipped), 1) : 0,
    bySubject,
    byTopic,
    time: { overTime, fastWrong, slowCorrect },
    confidenceMatrix: matrix,
    overconfident,
    underconfident,
    questions: results,
    insights,
  };
}
