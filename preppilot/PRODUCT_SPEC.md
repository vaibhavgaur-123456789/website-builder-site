# PrepPilot — Product Specification

> Working name. All branding lives in `src/config/brand.ts`, so a rename touches one file.

## 1. What the product is

PrepPilot is a preparation **operating system** for objective competitive exams (SSC, Railway, Banking, State PSC prelims, Defence, CUET…).
It does not just tell a student what to study. It measures **PLAN vs ACTION vs RESULT** and changes the next plan based on the gap.

Core loop, run every day:

```
ASSESS → PLAN → STUDY → TRACK → TEST → ANALYZE → REVISE → ADAPT → REPEAT
```

| Question the student has | Where it is answered |
|---|---|
| What should I study today? | Home → *Next action*, Plan → today |
| When should I study it? | Plan → timeline (time slots from preferred study times) |
| What did I actually complete? | Session end form, Night review, Plan (actual vs planned) |
| What am I weak at? | Analytics → Weak topics (Weakness engine) |
| What should I revise next? | Study → Revision (spaced-revision engine) |
| Am I improving? | Analytics → trends, Weekly report |
| Am I falling behind pace? | Analytics → Exam countdown & pace |
| How exam-ready am I? | Readiness score + methodology + confidence |
| What should I change tomorrow? | Night review → adaptation notes, Daily briefing |
| How do I compare with a benchmark? | Analytics → Benchmark (opt-in, anonymized) |

## 2. Honesty principles (non-negotiable)

1. **No selection-probability claims.** The app never says "X% chance of selection". It shows a *Preparation Readiness* index.
2. Every number is labelled as one of:
   - **Measured**: computed directly from the student's recorded activity (accuracy, minutes, mock scores).
   - **Estimate**: app-generated from measured data using a published formula (readiness, pace projections).
   - **Benchmark**: an aggregate of other students (anonymized, k ≥ 20) or a clearly labelled *reference* value.
   - **Projection**: a forward-looking extrapolation, always shown with its assumptions.
3. Every estimate shows a **confidence level** (Low / Medium / High) based on sample size.
4. Every scheduled task stores **why** it was scheduled, in human language.
5. The tone is supportive and factual: "You completed 62% of today's plan. Let's recover the remaining 38% tomorrow." Never shaming.

## 3. Personas

- **Aarti, 22, SSC CGL, 9 months out**: studies 5h/day, strong in English, weak in Quant. Needs structure and a measurable path.
- **Rohit, 25, working, RRB NTPC, 6 weeks out**: 2h/day, often misses evening blocks. Needs realistic plans and recovery, not guilt.
- **Sneha, 18, CUET**: phone distractions. Needs focus mode and short sessions.

## 4. Feature specification (by phase)

### Phase 1 — MVP (must work end-to-end)

| Area | Behaviour |
|---|---|
| **Auth** | Email + password (bcrypt, cost 12). Signed, httpOnly session cookie backed by a DB session row (revocable). Google OAuth when `GOOGLE_CLIENT_ID/SECRET` are set; the button is hidden otherwise. |
| **Onboarding** | 7 steps: about you → exam & date → level & time → study times & goals → subjects & topics status → strengths/weaknesses & past mocks → preferences (language, notifications, benchmark consent). Optional steps are skippable. Ends with an optional 10-question **baseline diagnostic** built from the exam's question bank. |
| **Baseline output** | Preparation baseline summary, initial plan (today + 7-day outline), subject distribution, initial revision schedule for completed topics, initial readiness estimate (confidence: Low), recommended daily hours. |
| **Exam system** | Exam → Sections → Subjects → Topics → Subtopics, with weightage, difficulty and question types. Data-driven: new exams are added via seed files or the admin panel, with no code changes. |
| **Daily planner** | Auto-generated timeline with time slots, goals (minutes + question target) and stored reasons. Drag-and-drop reorder (touch + keyboard). Add, edit and delete tasks with feasibility validation. Missed tasks are triaged, never silently deleted. |
| **Focus session** | Countdown or stopwatch, pause, break timer, objective, question target, notes, completion form (actual minutes, questions attempted/correct, difficulty, focus, energy, distractions). Timer state survives reloads and offline periods. |
| **Planned vs actual** | Stored separately at task, session and day level. Shown on Plan, Home and Analytics. |
| **XP & levels** | Server-computed, dedupe-keyed and capped (see anti-gaming). |
| **Dashboard (Home)** | Answers "what should I do now?" first: next action, today's progress, readiness, attention items, this week, next milestone, countdown. |
| **Mock tests** | Full, sectional, topic, custom and diagnostic tests; timed; per-question confidence; server-side scoring with negative marking. |
| **Basic analytics** | 7/30-day study minutes, questions, accuracy, subject performance, mock trend, readiness trend. |
| **Weak-topic detection** | Smoothed accuracy + trend + attempt count, with a HIGH/MEDIUM priority and a 5-step recovery pathway. |
| **Revision system** | Spaced intervals 1-3-7-14-30-60 days, adapted by accuracy, recall confidence and lapses. |
| **Readiness score** | 6 components, configurable weights, methodology page, confidence level, daily history. |
| **Exam countdown** | Days left plus required vs current pace (topics/week, questions/day, mocks/week), described calmly. |

### Phase 2

AI coach (provider-abstracted, rule-based fallback), adaptive scheduling (execution-ratio and blocker-aware), mistake book with auto-categorization and user correction, recovery mode, advanced mock analysis (confidence matrix, time analysis), weekly reports, in-app notifications with preferences and anti-spam, night review and daily briefing, goals cascade, personalization insights.

### Phase 3 (architected, partially implemented)

Anonymized benchmarking (k-anonymity aggregation job plus labelled reference seeds), advanced AI personalization, mentor features, study groups, content marketplace. Only benchmarking ships in this build. The others are schema and design notes only.

## 5. Key rules

### 5.1 Missed task triage
Each missed or partial task gets exactly one action, with a reason:

| Condition (first match wins) | Action |
|---|---|
| Task ≥ 50% done | **REDUCE**: carry over only the remaining minutes |
| Same topic already planned in the next 2 days | **MERGE** into that task |
| Revision task (spacing matters) | **RESCHEDULE** to the next day |
| Priority ≥ 0.6 | **RESCHEDULE** to the next day |
| Priority < 0.35 | **OPTIONAL**: offered, not required |
| otherwise | **POSTPONE** within 3 days |

The student can override any action.

### 5.2 Recovery mode
- **Triggers** (evaluated daily): ≥ 3 of the last 5 planned days with completion < 50%, **or** a backlog greater than 1.5 × daily capacity. The student can also turn it on manually.
- **Behaviour**: capacity = 85% of the realistic recent actual minutes (never more than the profile's hours). Only high-value, weak or revision-due work is planned, and low-priority backlog is marked OPTIONAL. The banner says: "You are behind your original plan. We will not try to complete everything at once."
- **Exit**: 3 consecutive days with ≥ 70% completion, or manual exit.

### 5.3 Anti-gaming
- Sessions shorter than 5 active minutes earn no study XP. Active time can't exceed the server-measured wall-clock time. Overlapping sessions are rejected, and a single session is capped at 4h.
- Study XP is capped at 360/day and question XP at 200/day. Every XP event has a unique dedupe key.
- Mock scores come only from server-scored attempts. A mock earns XP only if attempt rate ≥ 30% and time spent ≥ 20% of its duration (or ≥ 30s per attempted question).
- Practice question counts entered on the session form are capped at a plausible rate (≤ 3 questions/min).

### 5.4 Notifications
Types: study reminder, revision reminder, mock reminder, missed task, exam countdown (milestones only: 60/30/14/7/3/1 days), daily briefing, weekly review.
Per-type toggles, quiet hours, a max per day (default 4), and a dedupe key per (type, date).

## 6. Monetization (architecture only)

| Free (forever) | Premium |
|---|---|
| Planner, focus sessions, tracking, XP, basic analytics, mock tests, revision engine, readiness score, recovery banner, data export/deletion | AI coach (LLM), advanced adaptive planner options, advanced mock analysis, detailed readiness reports, personalized recovery plans, benchmark deep-dives |

Gating goes through `src/server/entitlements.ts`. `PREMIUM_GATING=off` (the default in dev) unlocks everything. Safety, privacy and basic study functions are never gated.

## 7. Success metrics

North star: **"Does the student's measured preparation improve over time?"**, operationalised as the share of active students whose 4-week accuracy and readiness trend is positive.
Supporting (see admin → metrics): D1/D7/D30 retention, sessions per active day, plan completion %, study hours/week, questions/week, mocks/week, accuracy change, revision completion %, WAU, coach usage, recovery-mode usage and exits.
