# PrepPilot — Implementation Plan

Status legend: ✅ done · 🟡 partial (see notes) · ⏳ not started

## Environment notes (this machine)
- Node v24 LTS and MinGit were installed **portably** in `%LOCALAPPDATA%\Programs` (no admin rights), and both were added to the user PATH.
- No local Postgres, so dev uses SQLite (see DATABASE_SCHEMA.md → Moving to PostgreSQL).
- The app lives in `./preppilot`, inside the existing web-studio repo, on branch `feat/preppilot`. It is never pushed automatically, because pushes may deploy the existing site.

## Phase 1 — MVP

| Step | Scope | Verification |
|---|---|---|
| 1. Requirements | PRODUCT_SPEC.md | review |
| 2. Architecture | ARCHITECTURE.md | review |
| 3. Schema | schema.prisma, migration, DATABASE_SCHEMA.md | `prisma migrate dev` |
| 4. Structure | config, lib, server, components, app route groups | build |
| 5. Engines | dates, priority, planner, triage, adaptation, revision, readiness, scoring, xp, mockScoring, mistakes, weakness, recovery, pace, insights, streaks | vitest unit tests |
| 6. Seed | 3 exams (SSC CGL Tier 1, RRB NTPC CBT 1, IBPS PO Prelims) with real syllabus structure, original sample questions, official mocks, achievements, labelled reference benchmarks, demo user with 3 weeks of realistic history | `npm run db:seed` |
| 7. Auth | signup, login, logout, session guard, proxy redirect, rate limit, Google OAuth (env-gated) | integration tests |
| 8. Onboarding | 7-step wizard + baseline diagnostic → baseline, plan, revision schedule, readiness | journey test |
| 9. Planner | today/week, reasons, drag-and-drop, add/edit/delete with feasibility validation, missed-task triage, regenerate | unit + integration |
| 10. Focus session | timer/stopwatch/pause/break, offline-safe store, completion form → actuals, XP, topic state, revision | integration |
| 11. Home | next action, progress, readiness, attention, week, milestone, countdown, briefing | build + browser check |
| 12. Mock system | list, custom builder, timed player with confidence, server scoring, analysis dashboard | unit + integration |
| 13. Analytics | 7/30-day charts, subject performance, weak topics, readiness trend + methodology, pace | browser check |
| 14. Revision & weakness | due list, revision completion with recall rating, recovery pathway | unit |

## Phase 2

| Step | Scope |
|---|---|
| 15. Mistake book | auto-categorization, user correction, top recurring mistake, targeted review tasks |
| 16. Recovery mode | auto trigger/exit, banner, recovery plan |
| 17. Night review & daily briefing | blockers feed adaptation |
| 18. Weekly report | generation + history |
| 19. Notifications | preferences, generator with dedupe/quiet hours/cap, in-app center, cron endpoint |
| 20. AI coach | AIService, Anthropic provider, rule-based provider, context builders, intent router, chat UI |
| 21. Goals | cascade auto-creation from exam goal, progress |
| 22. Personalization insights | time-of-day, session length, subject (sample-size gated) |
| 23. Gamification | achievements catalog, weekly challenge, personal records |

## Phase 3 (in this build)
| 24. Benchmarking | aggregation job with k ≥ 20, opt-out, reference fallback clearly labelled |
| 25. Admin | exams/subjects/topics/questions/mocks/benchmarks CRUD, product metrics, audit log |
| 26. Privacy | export JSON, delete account, opt-outs |
| 27. PWA/offline | manifest, service worker, outbox replay |

## Quality gates (after each phase)
`npm run typecheck` · `npm run lint` · `npm test` · `npm run build`, then report what works and what remains.

## Explicitly out of scope for this build
- Native Android/iOS apps (the API is ready for them).
- Real push notifications to closed apps (needs VAPID keys and a push service). In-app and while-open browser notifications are implemented.
- Payment processing (a Subscription table and entitlement gates exist).
- Mentor features, study groups, content marketplace.
