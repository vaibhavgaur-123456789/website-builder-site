# PrepPilot — Database Schema

Source of truth: [`prisma/schema.prisma`](prisma/schema.prisma). Migrations: `prisma/migrations/`. Seed: `prisma/seed.ts`.

## Conventions

| Convention | Why |
|---|---|
| `cuid()` string IDs | Safe to generate anywhere, no enumeration |
| "Enum" columns are `String`, validated with zod (`src/lib/validation/enums.ts`) | Portable between SQLite and Postgres. Adding a value needs no migration. |
| JSON columns are `String`, accessed via `parseJson/toJson` (`src/lib/json.ts`) | Portable. On Postgres they can become `Json`/`jsonb` without changing call sites. |
| Calendar days are `dayKey` strings `YYYY-MM-DD` **in the user's timezone** | A "study day" is a local concept. Avoids UTC-midnight bugs for IST students. |
| All user-owned rows have `userId` with `onDelete: Cascade` | Account deletion is a single `DELETE FROM User` |
| Aggregates (`DailyStat`, `ReadinessSnapshot`, `WeeklyReport`) are **snapshots** | History must not change when formulas change. Each stores its `configVersion` where relevant. Raw facts stay in sessions and attempts. |

## Entity map

```
User ─1:1─ StudentProfile ─N:1─ Exam
 │    └1:1─ NotificationPrefs
 │
 ├─< AuthSession
 ├─< UserTopicState >─ Topic            (per-topic mastery + SRS + recovery pathway)
 ├─< PlanDay ─< Task >─ Topic           (plan)            Task ─< StudySession (execution)
 ├─< StudySession ─< QuestionAttempt
 ├─< MockAttempt ─< QuestionAttempt >─ Question
 │                        └─1:1─ Mistake
 ├─< RevisionEvent >─ Topic
 ├─< Goal (self-referencing cascade: EXAM → MONTHLY → WEEKLY → DAILY)
 ├─< XpEvent (dedupeKey unique)   ├─< UserAchievement >─ Achievement
 ├─< DailyStat   ├─< ReadinessSnapshot   ├─< WeeklyReport
 ├─< Notification (dedupeKey unique)
 ├─< AIConversation ─< AIMessage
 ├─< ProductEvent   └─< Subscription

Exam ─< ExamSection ─< Subject ─< Topic ─< Topic (subtopics via parentId)
                                  └─< Question ─< MockQuestion >─ Mock
Exam ─< BenchmarkStat (optionally per Subject/Topic)
```

## Tables

### Identity & profile
- **User**: `email` unique; `passwordHash` (bcrypt, nullable for Google-only accounts); `googleId` unique; `role` USER/ADMIN; `timezone`; `plan` FREE/PREMIUM; `benchmarkOptIn`; `theme`; `onboardedAt`.
- **AuthSession**: server-side session row referenced by the signed cookie. Deleting it logs out. Index `userId`.
- **StudentProfile**: target exam and date, level, capacity (`dailyMinutes`), preferred slots, goals, block length, self-reported past mock scores, recovery-mode state, and the onboarding `baseline` summary.
- **NotificationPrefs**: master switch, per-type switches, quiet hours, `maxPerDay`.

### Exam content (admin-managed, exam-agnostic)
- **Exam**: marking scheme (`marksPerQuestion`, `negativeMarking`), duration, total questions, category.
- **ExamSection → Subject → Topic (→ subtopic Topic)**. Subject `weightage` = share of marks. Topic `weightage` 1–5 = importance, `difficulty` 1–5, `estimatedMinutes` to first completion. Subject flags `isQuantitative` and `isMemoryBased` drive mistake heuristics without hard-coding subject names.
- **Question**: MCQ `options` (JSON), `correctIndex`, `explanation`, `difficulty`, `expectedSeconds`. Index `(topicId, difficulty)` for "easy → medium" pathway selection.
- **Mock / MockQuestion**: official mocks (`createdById = null`) and user custom tests. Types: FULL, SECTIONAL, TOPIC, CUSTOM, DIAGNOSTIC.

### Learning state
- **UserTopicState** (unique `userId, topicId`): status, minutes, attempts/correct, SRS fields (`srsStage`, `easeFactor`, `intervalDays`, `nextRevisionOn`, `lapses`), weakness `recoveryStep`. Index `(userId, nextRevisionOn)` powers "revision due today".
- **RevisionEvent**: each scheduled revision and its outcome (ADVANCED / HELD / LAPSED). Gives revision-health history.

### Plan & execution (PLAN vs ACTION)
- **PlanDay** (unique `userId, date`): capacity, planned minutes, mode (NORMAL/RECOVERY), adaptation notes, config version.
- **Task**: planned fields (`plannedMinutes`, `questionTarget`, `startTime`, `reasons`, `priorityScore`) kept **separate from** actual fields (`actualMinutes`, `questionsDone`, `completionPct`). Missed-task triage: `missedAction`, `missedReason`, `carriedFromId`. Index `(userId, date)`.
- **StudySession**: `clientId` unique (idempotent offline replay), device `startedAt` plus `serverStartedAt` (anti-gaming bound), active/break seconds, ratings, distractions, `validated`, and `flags` explaining any adjustment.

### Results (RESULT)
- **MockAttempt**: draft `answers` while in progress. After submission the server-computed score, accuracy, attempt rate, time, and `analysis` JSON (subject/topic/time/confidence breakdown).
- **QuestionAttempt**: one row per answered or skipped question, from a mock or a practice session, with time, confidence and decision. Indexes `(userId, createdAt)` and `(userId, questionId)`.
- **Mistake** (1:1 with a wrong QuestionAttempt): `autoCategory` from heuristics, `category` (user-correctable), `resolved`, `nextReviewOn`.

### Motivation & reporting
- **Goal**: cascading via `parentId`; metrics MINUTES / QUESTIONS / ACCURACY / TOPICS_COMPLETED / MOCKS / SCORE.
- **XpEvent**: `dedupeKey` unique, so the same activity can never be rewarded twice. Level is derived from the XP sum and not stored.
- **Achievement / UserAchievement**: catalog + unlocks (unique pair).
- **DailyStat** (unique `userId, date`): planned vs actual totals, sub-scores, Daily score, night-review blocker.
- **ReadinessSnapshot** (unique `userId, date`): score, components, confidence, config version.
- **WeeklyReport** (unique `userId, weekStart`).

### Platform
- **Notification**: `dedupeKey` unique (e.g. `REVISION:2026-09-26`) prevents spam. `scheduledFor`, `deliveredAt`, `readAt`.
- **AIConversation / AIMessage**: stores `intent`, `provider`, and which `contextUsed` sections went to the model (auditability).
- **BenchmarkStat**: median/p25/p75 + `sampleSize` + `source` (AGGREGATE = real anonymized users with k ≥ 20; REFERENCE = seeded illustrative values, always labelled in the UI).
- **ProductEvent**: product analytics (retention, usage). Deleted with the user.
- **Subscription**: future billing.
- **RateLimitBucket**: fixed-window counters (works across server instances).
- **AdminAuditLog**: who changed which content.

## Index rationale (hot paths)

| Query | Index |
|---|---|
| Today's tasks | `Task(userId, date)` |
| Revision due | `UserTopicState(userId, nextRevisionOn)` |
| Last N days of stats | `DailyStat(userId, date)` unique |
| Accuracy windows / trends | `QuestionAttempt(userId, createdAt)` |
| Mock history | `MockAttempt(userId, submittedAt)` |
| Unresolved mistakes | `Mistake(userId, resolved)` |
| Notification feed | `Notification(userId, scheduledFor)` |
| Retention metrics | `ProductEvent(name, date)` |

## Moving to PostgreSQL

1. `provider = "postgresql"` in `schema.prisma`.
2. Optionally change JSON `String` columns to `Json` (call sites use `parseJson`, which accepts both).
3. Delete `prisma/migrations` and create a fresh baseline: `npx prisma migrate dev --name init`. Deploy with `npx prisma migrate deploy`.
4. For Supabase, enable Row Level Security on all tables with a deny-all policy. The app connects with the service role through Prisma, so all access goes through the API's authorization layer.
