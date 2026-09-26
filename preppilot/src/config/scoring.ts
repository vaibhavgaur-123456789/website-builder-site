// Every tunable weight and threshold used by the engines.
// Bump CONFIG_VERSION when changing values: snapshots record the version they were computed with.
export const CONFIG_VERSION = "2026.09.1";

export const PRIORITY_WEIGHTS = {
  importance: 0.24,
  weakness: 0.24,
  revisionUrgency: 0.16,
  errorRate: 0.1,
  timePressure: 0.1,
  trend: 0.08,
  unfinished: 0.08,
} as const;
export type PriorityWeights = { [K in keyof typeof PRIORITY_WEIGHTS]: number };

export const READINESS_WEIGHTS = {
  coverage: 0.25,
  mock: 0.2,
  accuracy: 0.2,
  revision: 0.1,
  consistency: 0.15,
  trend: 0.1,
} as const;
export type ReadinessWeights = { [K in keyof typeof READINESS_WEIGHTS]: number };

export const DAILY_SCORE_WEIGHTS = {
  execution: 0.4,
  focus: 0.2,
  revision: 0.2,
  testing: 0.2,
} as const;

export const ACCURACY = {
  /** Bayesian prior: accuracy assumed before evidence, and its weight in pseudo-attempts. */
  prior: 0.6,
  priorWeight: 8,
  weakThreshold: 0.65,
  highPriorityThreshold: 0.55,
  minAttemptsForWeakness: 10,
  decliningDelta: 0.08,
} as const;

export const REVISION = {
  intervals: [1, 3, 7, 14, 30, 60],
  minEase: 1.3,
  maxEase: 2.8,
  defaultEase: 2.5,
  advanceAccuracy: 0.8,
  holdAccuracy: 0.6,
  leechLapses: 3,
  leechFactor: 0.7,
  maxRevisionShareOfDay: 0.3,
  minutesPerRevision: 20,
} as const;

export const PLANNER = {
  minBlock: 20,
  maxBlock: 90,
  defaultBlock: 45,
  breakMinutes: 10,
  maxTaskMinutes: 180,
  /** A manual plan may exceed capacity by this factor before it is rejected as impossible. */
  overloadTolerance: 1.25,
  questionsPerMinute: { STUDY: 0.25, PRACTICE: 0.6, REVISION: 0.5 } as Record<string, number>,
  mistakeReviewMinutes: 20,
  mistakeReviewThreshold: 5,
  mockAnalysisMinutes: 30,
  slotStarts: { MORNING: "06:30", AFTERNOON: "13:30", EVENING: "18:00", NIGHT: "21:00" } as Record<string, string>,
  slotEnds: { MORNING: "12:00", AFTERNOON: "17:00", EVENING: "21:00", NIGHT: "23:30" } as Record<string, string>,
  /** Final share of the timeline reserved for revision and mocks (no new topics). */
  finalRevisionShare: 0.15,
} as const;

export const RECOVERY = {
  lookbackDays: 5,
  lowCompletion: 0.5,
  lowDaysToTrigger: 3,
  backlogFactor: 1.5,
  capacityFactor: 0.85,
  exitCompletion: 0.7,
  exitDays: 3,
} as const;

export const XP = {
  sessionMinActiveMinutes: 5,
  maxSessionMinutes: 240,
  studyXpPerMinute: 1,
  studyXpDailyCap: 360,
  questionXpPerCorrect: 1,
  questionXpDailyCap: 200,
  maxQuestionsPerMinute: 3,
  revisionXp: 20,
  mockXp: { FULL: 60, SECTIONAL: 30, TOPIC: 20, CUSTOM: 20, DIAGNOSTIC: 25 } as Record<string, number>,
  mockMinAttemptRate: 0.3,
  mockMinTimeShare: 0.2,
  consistencyXp: 10,
  streakBonusPerDay: 3,
  streakBonusCap: 21,
  improvementXp: 30,
  qualifyingDayMinutes: 25,
} as const;

export const CONFIDENCE = {
  mocksForFull: 10,
  questionsForFull: 600,
  activeDaysForFull: 21,
  high: 0.7,
  medium: 0.35,
} as const;

export const INSIGHTS = {
  minSessionsPerBucket: 5,
  minQuestionsPerBucket: 40,
  minRelativeDifference: 0.1,
} as const;

export const BENCHMARK = { minSampleSize: 20 } as const;

export const NOTIFY = { defaultMaxPerDay: 4 } as const;
