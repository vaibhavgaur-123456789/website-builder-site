import { z } from "zod";
import { isDayKey, isValidTimeZone } from "@/lib/engine/dates";

export const dayKeySchema = z.string().refine(isDayKey, "Use YYYY-MM-DD");
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const idSchema = z.string().min(1).max(64);

export const SLOTS = ["MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const;
export const PREP_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const BLOCKERS = ["TIME", "LOW_ENERGY", "PHONE", "DIFFICULT_TOPIC", "UNEXPECTED_WORK", "OTHER"] as const;
export const MISTAKE_CATEGORIES = ["CONCEPTUAL", "CALCULATION", "CARELESS", "TIME_MANAGEMENT", "GUESSING", "MEMORY"] as const;
export const TASK_TYPES = ["STUDY", "PRACTICE", "REVISION", "MOCK", "MOCK_ANALYSIS", "MISTAKE_REVIEW", "CUSTOM"] as const;
export const CONFIDENCE = ["LOW", "MEDIUM", "HIGH"] as const;

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  timezone: z.string().refine(isValidTimeZone).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const onboardingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  ageRange: z.enum(["UNDER_18", "18_21", "22_25", "26_30", "30_PLUS"]).nullable().optional(),
  examId: idSchema,
  examDate: dayKeySchema,
  targetScore: z.number().min(0).max(1000).nullable().optional(),
  targetRank: z.number().int().min(1).max(10_000_000).nullable().optional(),
  prepLevel: z.enum(PREP_LEVELS),
  dailyMinutes: z.number().int().min(30).max(720),
  preferredSlots: z.array(z.enum(SLOTS)).min(1).max(4),
  dailyGoalMinutes: z.number().int().min(15).max(720).optional(),
  weeklyGoalMinutes: z.number().int().min(60).max(5040).optional(),
  completedTopicIds: z.array(idSchema).max(500).default([]),
  inProgressTopicIds: z.array(idSchema).max(500).default([]),
  weakSubjectIds: z.array(idSchema).max(50).default([]),
  strongSubjectIds: z.array(idSchema).max(50).default([]),
  previousMockScores: z.array(z.number().min(0).max(100)).max(10).default([]),
  language: z.string().min(2).max(10).default("en"),
  notifications: z.boolean().default(true),
  benchmarkOptIn: z.boolean().default(true),
  timezone: z.string().refine(isValidTimeZone).optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const taskCreateSchema = z.object({
  date: dayKeySchema,
  title: z.string().trim().min(1).max(120),
  type: z.enum(TASK_TYPES).default("CUSTOM"),
  topicId: idSchema.nullable().optional(),
  startTime: hhmm.nullable().optional(),
  plannedMinutes: z.number().int().min(5).max(240),
  questionTarget: z.number().int().min(0).max(500).default(0),
  objective: z.string().max(500).default(""),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  startTime: hhmm.nullable().optional(),
  plannedMinutes: z.number().int().min(5).max(240).optional(),
  questionTarget: z.number().int().min(0).max(500).optional(),
  objective: z.string().max(500).optional(),
  status: z.enum(["PENDING", "SKIPPED"]).optional(),
  isOptional: z.boolean().optional(),
  missedAction: z.enum(["RESCHEDULE", "MERGE", "REDUCE", "POSTPONE", "OPTIONAL"]).optional(),
});

export const reorderSchema = z.object({ date: dayKeySchema, orderedIds: z.array(idSchema).min(1).max(50) });

export const sessionStartSchema = z.object({
  clientId: z.string().min(8).max(64),
  taskId: idSchema.nullable().optional(),
  topicId: idSchema.nullable().optional(),
  mode: z.enum(["TIMER", "STOPWATCH"]).default("TIMER"),
  plannedMinutes: z.number().int().min(0).max(240).default(0),
  startedAt: z.coerce.date(),
});

export const sessionCompleteSchema = z.object({
  clientId: z.string().min(8).max(64),
  endedAt: z.coerce.date(),
  activeSeconds: z.number().int().min(0).max(86_400),
  breakSeconds: z.number().int().min(0).max(86_400).default(0),
  pauseCount: z.number().int().min(0).max(1000).default(0),
  questionsAttempted: z.number().int().min(0).max(2000).default(0),
  questionsCorrect: z.number().int().min(0).max(2000).default(0),
  difficultyRating: z.number().int().min(1).max(5).nullable().optional(),
  focusRating: z.number().int().min(1).max(5).nullable().optional(),
  energyRating: z.number().int().min(1).max(5).nullable().optional(),
  distractionCount: z.number().int().min(0).max(500).default(0),
  completionPct: z.number().int().min(0).max(100),
  notes: z.string().max(2000).default(""),
  recall: z.number().int().min(1).max(4).nullable().optional(),
  topicCompleted: z.boolean().default(false),
  // Offline replay: the start call may never have reached the server.
  start: sessionStartSchema.omit({ clientId: true }).optional(),
});
export type SessionCompleteInput = z.infer<typeof sessionCompleteSchema>;

export const mockAnswerSchema = z.object({
  selected: z.number().int().min(0).max(9).nullable(),
  timeSpentSec: z.number().int().min(0).max(36_000).default(0),
  confidence: z.enum(CONFIDENCE).nullable().default(null),
});
export const mockAnswersSchema = z.object({ answers: z.record(z.string(), mockAnswerSchema) });

export const customMockSchema = z.object({
  title: z.string().trim().max(80).optional(),
  subjectIds: z.array(idSchema).max(20).default([]),
  topicIds: z.array(idSchema).max(50).default([]),
  count: z.number().int().min(5).max(100),
  durationMinutes: z.number().int().min(5).max(180),
  focus: z.enum(["MIXED", "WEAK", "UNSEEN", "MISTAKES"]).default("MIXED"),
});

export const nightReviewSchema = z.object({
  date: dayKeySchema,
  blocker: z.enum(BLOCKERS).nullable(),
  note: z.string().max(500).default(""),
});

export const revisionCompleteSchema = z.object({
  topicId: idSchema,
  recall: z.number().int().min(1).max(4),
  accuracy: z.number().min(0).max(1).nullable().optional(),
});

export const mistakeUpdateSchema = z.object({
  category: z.enum(MISTAKE_CATEGORIES).optional(),
  note: z.string().max(1000).optional(),
  resolved: z.boolean().optional(),
});

export const mistakeReviewSchema = z.object({ selectedIndex: z.number().int().min(0).max(9) });

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone").optional(),
  language: z.string().min(2).max(10).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  examDate: dayKeySchema.optional(),
  targetScore: z.number().min(0).max(1000).nullable().optional(),
  dailyMinutes: z.number().int().min(30).max(720).optional(),
  dailyGoalMinutes: z.number().int().min(15).max(720).optional(),
  weeklyGoalMinutes: z.number().int().min(60).max(5040).optional(),
  preferredSlots: z.array(z.enum(SLOTS)).min(1).max(4).optional(),
  preferredBlockMin: z.number().int().min(20).max(90).optional(),
  benchmarkOptIn: z.boolean().optional(),
  recoveryMode: z.boolean().optional(),
});

export const notificationPrefsSchema = z.object({
  enabled: z.boolean().optional(),
  studyReminder: z.boolean().optional(),
  revisionReminder: z.boolean().optional(),
  mockReminder: z.boolean().optional(),
  missedTask: z.boolean().optional(),
  examCountdown: z.boolean().optional(),
  dailyBriefing: z.boolean().optional(),
  weeklyReview: z.boolean().optional(),
  quietStart: hhmm.optional(),
  quietEnd: hhmm.optional(),
  maxPerDay: z.number().int().min(0).max(10).optional(),
});

export const coachMessageSchema = z.object({
  conversationId: idSchema.nullable().optional(),
  message: z.string().trim().min(1).max(2000),
});

export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE"), password: z.string().max(200).optional() });
