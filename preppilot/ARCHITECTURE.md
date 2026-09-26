# PrepPilot — Architecture

## 1. Stack and why

| Concern | Choice | Reason |
|---|---|---|
| App framework | **Next.js 16 (App Router) + TypeScript** | One deployable for UI and API. Server components read data directly, and route handlers form a versioned REST API (`/api/v1`) that a future Android/iOS client can reuse. |
| Styling | **Tailwind CSS v4** with CSS-variable design tokens | Light and dark themes come from tokens, and branding changes are made in one place. |
| Database | **Prisma 6 ORM**; **SQLite in development**, **PostgreSQL in production** | Zero-setup local development. The schema avoids SQLite-only features: enums are validated strings, and JSON is stored as text through a typed helper. Switching to Postgres is a `provider` change plus `DATABASE_URL`. Prisma 6 is pinned because 7/8 require driver adapters and are still settling. |
| Auth | Custom, minimal: **bcryptjs** + **jose** JWT cookie + `Session` table | Few dependencies, fully testable, revocable sessions. Google OAuth 2.0 (PKCE + state) is implemented directly and enabled by env vars. |
| Validation | **zod 4** at every API boundary | |
| Charts | **Recharts** | |
| Client state | **Zustand** (timer and offline outbox, persisted to localStorage) | Server data comes from server components plus `router.refresh()`, so no client cache layer is needed. |
| Drag & drop | **@dnd-kit** | Touch and keyboard accessible. |
| Tests | **Vitest** (unit + DB integration against a throwaway SQLite file) | |
| PWA/offline | Hand-written service worker + manifest | No plugin lock-in. |

## 2. Layering

```
UI (app/ pages, components)          ← server components render; client components mutate via /api/v1
        │
API (app/api/v1/**/route.ts)         ← auth guard → zod validation → rate limit → service call → JSON
        │
Services (src/server/services/*)     ← load data with Prisma, call engines, persist results, emit XP/notifications
        │
Engines (src/lib/engine/*)           ← PURE functions, no I/O: priority, planner, revision, readiness, xp,
        │                               scoring, mock scoring, weakness, mistakes, recovery, pace, insights
Data (Prisma → SQLite/Postgres)
```

**Rule:** all decision logic lives in pure engines with injected inputs (including "now"). Engines are unit tested without a database. Services are thin orchestration and are covered by integration tests.

## 3. Directory layout

```
preppilot/
  prisma/              schema.prisma, migrations/, seed.ts, seed-data/*.ts (exam content)
  public/              manifest.webmanifest, sw.js, icons
  src/
    config/            brand.ts (name/colors), scoring.ts (all weights & thresholds, versioned)
    lib/
      engine/          pure domain logic (see §4)
      validation/      zod schemas shared by API + forms
      client/          api fetcher with offline outbox, zustand stores
      json.ts, dates.ts, utils
    server/
      db.ts            Prisma singleton
      auth/            password, session (JWT+DB), guards, google oauth
      rate-limit.ts    DB-backed fixed-window limiter
      entitlements.ts  free/premium feature gates
      ai/              AIService interface, providers (anthropic, rule-based), context builders
      services/        onboarding, planner, session, mock, revision, readiness, analytics,
                       gamification, mistakes, notifications, weekly, coach, benchmark, privacy, admin
    components/        ui/ primitives, charts/, feature components
    app/
      (auth)/login, signup           onboarding/
      (app)/  page(home) plan study tests analytics profile coach …   ← bottom nav layout
      admin/                          ← role-gated
      api/v1/…                        ← REST
    proxy.ts           redirects unauthenticated page requests (Next 16 "proxy" = old middleware)
  tests/               unit/ (engines), integration/ (services + journey)
```

## 4. Engines (pure)

| Engine | Input → Output |
|---|---|
| `dates` | Timezone-aware day keys (`YYYY-MM-DD` in the user's IANA zone), week start, day diffs |
| `priority` | Topic stats + config weights → score in [0, 1] + component breakdown + **human-readable reasons** |
| `planner` | Capacity, slots, candidates, due revisions, carry-overs, mock schedule, adaptation signals → timed task list + feasibility report. Also validates manual edits. |
| `adaptation` | Last 7–14 days of planned/actual/blockers → capacity multiplier, preferred block length, subject deficits, notes |
| `triage` | Missed task + context → RESCHEDULE / MERGE / REDUCE / POSTPONE / OPTIONAL + reason |
| `revision` | SRS state + outcome → next stage, interval, ease, lapses, next due date |
| `readiness` | Component inputs + weights → score, components, reweighting for missing data, confidence |
| `scoring` | Day activity → Daily score (execution, focus, revision, testing) |
| `xp` | Activity → XP events with dedupe keys and caps; level curve |
| `mockScoring` | Answers + marking scheme → score, accuracy, attempt rate, per-subject/topic breakdown, time analysis, confidence matrix |
| `mistakes` | Wrong attempt signals → auto category; aggregate → top recurring mistake |
| `weakness` | Topic stats → weak flag, priority, trend, next recovery-pathway step |
| `recovery` | Recent day stats + backlog → enter/exit recovery + capacity |
| `pace` | Exam date, remaining syllabus, recent pace → required vs current pace (descriptive) |
| `insights` | Session history → personalization insights **only when sample thresholds are met** |
| `streaks` | Qualifying days → current/best streak (one forgiven gap per rolling 7 days) |

All weights and thresholds live in `src/config/scoring.ts` with a `version` string. Readiness snapshots store the version they were computed with.

## 5. Key flows

**Plan generation** (`planner.service.ensureDayPlan(userId, day)`): idempotent per day.
1. Triage yesterday's unfinished tasks → carry-overs.
2. Evaluate recovery mode.
3. Compute adaptation signals.
4. Score candidate topics (priority engine).
5. Collect due revisions.
6. Decide the mock slot (pace engine).
7. Run the planner engine and persist `PlanDay` + `Task[]` with reasons.

Regeneration keeps completed and manual tasks.

**Session completion** (`session.service.complete`): validate against the server start time → store the session → update the task (actual minutes, completion %) → update topic state (attempts/correct) → schedule revision if the topic becomes completed or a revision task is done → award XP (dedupe) → update the DailyStat → check achievements.

**Mock submission** (`mock.service.submit`): score on the server from stored answers → write QuestionAttempts → auto-create Mistakes for wrong answers → update topic stats → weakness recompute → XP → readiness snapshot refresh → a mock-analysis task tomorrow.

**Readiness** is recomputed lazily: at most once per day per user, plus immediately after a mock submission. It is stored in `ReadinessSnapshot`.

## 6. Security

- Passwords: bcrypt cost 12. Plaintext is never logged or stored. Minimum 8 characters.
- Session: HS256 JWT (`AUTH_SECRET`, ≥ 32 chars) containing only `sid`. The cookie is `httpOnly`, `sameSite=lax`, and `secure` in production. Every request checks that the DB `Session` row exists and hasn't expired, so logout and account deletion revoke immediately.
- Authorization: every service call is scoped by `userId` from the session, never from the request body. Admin routes require `role=ADMIN` (checked server-side in the layout and in each admin API handler).
- Input: zod on every body and query. Rate limits: auth endpoints (10/min/IP), coach (20/hour/user), writes (120/min/user).
- CSRF: sameSite=lax cookie + JSON-only mutation endpoints + an `Origin` check on mutating requests.
- Secrets live only in server env (`.env`, never `NEXT_PUBLIC_*`). The AI key is used only in `src/server/ai`.
- Privacy: data export (JSON of all user-owned rows), hard account deletion (cascade), benchmark opt-out (excluded from aggregation immediately), notification controls. Benchmarks are published only with sample size ≥ 20.

## 7. Offline & PWA

- `sw.js`: caches the app shell and static assets (cache-first). `GET /api/v1/today` is network-first with a cache fallback, so today's plan is visible offline.
- The timer is a Zustand store persisted to localStorage and derived from timestamps (not ticking counters), so it survives reloads and network loss.
- **Outbox:** mutations made offline (session completion, task status) are queued with a client-generated `clientId` and replayed on `online`. The server upserts by `clientId`, so replays are idempotent.

## 8. AI architecture

```
AIService (interface: complete(system, messages) → text)
  ├── AnthropicProvider   (fetch to the Messages API; model from AI_MODEL; key from ANTHROPIC_API_KEY)
  └── RuleBasedProvider   (deterministic, data-driven answers; used when no key, or on provider error)
Context builders → CoachContext (compact JSON: profile, today plan, 7-day actuals, weak topics,
                   due revisions, last mock summary, readiness, pace, blockers)
Intent router    → today / missed / limited-time / subject-falling / why-wrong / revision-plan /
                   last-mock / readiness / general
```

The model never receives raw tables. It gets the bounded CoachContext (≈ 2–4 KB), and each message stores which context sections were used.

## 9. Scaling path

- SQLite → Postgres (change the provider and run `prisma migrate deploy`). Indexes are already defined for hot paths: `(userId, date)` on tasks, stats and snapshots, and `(userId, createdAt)` on attempts.
- Cron endpoints (`/api/v1/cron/*`, protected by `CRON_SECRET`) handle notification scheduling and benchmark aggregation, and are driven by Vercel Cron or any scheduler.
- A future mobile app reuses `/api/v1` with the same cookie or a bearer token (the session layer accepts `Authorization: Bearer`).
