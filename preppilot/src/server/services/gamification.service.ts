import { prisma, isUniqueViolation } from "@/server/db";
import { addDays, weekStart } from "@/lib/engine/dates";
import { currentStreak, bestStreak } from "@/lib/engine/streaks";
import { levelFromXp, type XpAward } from "@/lib/engine/xp";
import { qualifyingDays } from "./stats.service";

/** Persist XP awards. Duplicate dedupe keys are silently ignored (an activity is rewarded once). */
export async function awardXp(userId: string, date: string, awards: XpAward[]): Promise<XpAward[]> {
  const created: XpAward[] = [];
  for (const a of awards) {
    if (a.amount <= 0) continue;
    try {
      await prisma.xpEvent.create({ data: { userId, date, type: a.type, amount: a.amount, reason: a.reason, dedupeKey: `${userId}:${a.dedupeKey}` } });
      created.push(a);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return created;
}

export async function xpEarnedToday(userId: string, date: string) {
  const rows = await prisma.xpEvent.groupBy({ by: ["type"], where: { userId, date }, _sum: { amount: true } });
  const by = Object.fromEntries(rows.map((r) => [r.type, r._sum.amount ?? 0]));
  return { study: by.STUDY ?? 0, questions: by.QUESTIONS ?? 0, total: rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0) };
}

export async function xpSummary(userId: string, today: string) {
  const [agg, days] = await Promise.all([prisma.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } }), qualifyingDays(userId)]);
  const total = agg._sum.amount ?? 0;
  const streak = currentStreak(days, today);
  return { ...levelFromXp(total), streak: streak.streak, forgivenOn: streak.forgivenOn, bestStreak: Math.max(bestStreak(days), streak.streak), studiedToday: days.has(today) };
}

export async function personalRecords(userId: string) {
  const [bestDay, mostQ, bestMock, days] = await Promise.all([
    prisma.dailyStat.findFirst({ where: { userId }, orderBy: { actualMinutes: "desc" } }),
    prisma.dailyStat.findFirst({ where: { userId }, orderBy: { questions: "desc" } }),
    prisma.mockAttempt.findFirst({ where: { userId, status: "SUBMITTED", mock: { type: { in: ["FULL", "SECTIONAL"] } } }, orderBy: { percent: "desc" }, include: { mock: true } }),
    qualifyingDays(userId),
  ]);
  return {
    longestDay: bestDay && bestDay.actualMinutes > 0 ? { minutes: bestDay.actualMinutes, date: bestDay.date } : null,
    mostQuestions: mostQ && mostQ.questions > 0 ? { questions: mostQ.questions, date: mostQ.date } : null,
    bestMock: bestMock ? { percent: bestMock.percent ?? 0, title: bestMock.mock.title } : null,
    bestStreak: bestStreak(days),
  };
}

type Check = { code: string; met: boolean };

/** Unlock any newly met achievements and award their XP. Returns the newly unlocked ones. */
export async function checkAchievements(userId: string, today: string) {
  const [catalog, unlocked, minutesAgg, qAgg, mocks, revisions, reviews, recovered, days] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    prisma.studySession.aggregate({ where: { userId, status: "COMPLETED", validated: true }, _sum: { activeSeconds: true }, _count: { _all: true } }),
    prisma.dailyStat.aggregate({ where: { userId }, _sum: { questions: true } }),
    prisma.mockAttempt.count({ where: { userId, status: "SUBMITTED" } }),
    prisma.revisionEvent.count({ where: { userId, completedOn: { not: null } } }),
    prisma.dailyStat.count({ where: { userId, reviewedAt: { not: null } } }),
    prisma.productEvent.count({ where: { userId, name: "weak_topic_recovered" } }),
    qualifyingDays(userId),
  ]);
  const have = new Set(unlocked.map((u) => u.achievementId));
  const hours = (minutesAgg._sum.activeSeconds ?? 0) / 3600;
  const questions = qAgg._sum.questions ?? 0;
  const streak = Math.max(currentStreak(days, today).streak, bestStreak(days));
  const wk = await prisma.dailyStat.aggregate({ where: { userId, date: { gte: addDays(today, -6) } }, _sum: { questions: true, correct: true } });
  const wkQ = wk._sum.questions ?? 0;
  const recoveryExits = await prisma.productEvent.count({ where: { userId, name: "recovery_exit" } });

  const checks: Check[] = [
    { code: "first_session", met: minutesAgg._count._all >= 1 },
    { code: "hours_10", met: hours >= 10 },
    { code: "hours_50", met: hours >= 50 },
    { code: "questions_100", met: questions >= 100 },
    { code: "questions_1000", met: questions >= 1000 },
    { code: "streak_7", met: streak >= 7 },
    { code: "streak_10", met: streak >= 10 },
    { code: "streak_30", met: streak >= 30 },
    { code: "first_mock", met: mocks >= 1 },
    { code: "mocks_10", met: mocks >= 10 },
    { code: "accuracy_80", met: wkQ >= 100 && (wk._sum.correct ?? 0) / wkQ >= 0.8 },
    { code: "weak_topic_recovered", met: recovered >= 1 },
    { code: "revisions_20", met: revisions >= 20 },
    { code: "night_review_7", met: reviews >= 7 },
    { code: "recovery_exit", met: recoveryExits >= 1 },
  ];
  const fresh = [];
  for (const c of checks) {
    const a = catalog.find((x) => x.code === c.code);
    if (!a || !c.met || have.has(a.id)) continue;
    try {
      await prisma.userAchievement.create({ data: { userId, achievementId: a.id } });
      fresh.push(a);
      if (a.xpReward > 0) await awardXp(userId, today, [{ type: "ACHIEVEMENT", amount: a.xpReward, reason: `Badge: ${a.name}`, dedupeKey: `achievement:${a.code}` }]);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return fresh;
}

/** One weekly challenge, chosen to reinforce the student's weakest habit. */
export async function weeklyChallenge(userId: string, today: string) {
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const stats = await prisma.dailyStat.findMany({ where: { userId, date: { gte: ws, lte: we } } });
  const revDue = stats.reduce((s, d) => s + d.revisionsDue, 0);
  const revDone = stats.reduce((s, d) => s + d.revisionsDone, 0);
  const activeDays = stats.filter((d) => d.actualMinutes >= 25).length;
  const mocks = stats.reduce((s, d) => s + d.mocksTaken, 0);
  const prev = await prisma.dailyStat.findMany({ where: { userId, date: { gte: addDays(ws, -7), lt: ws } } });
  const prevActive = prev.filter((d) => d.actualMinutes >= 25).length;

  let c: { code: string; title: string; target: number; progress: number };
  if (prevActive < 5) c = { code: "days5", title: "Study on 5 days this week", target: 5, progress: activeDays };
  else if (revDue > 0 && revDone / Math.max(1, revDue) < 0.8) c = { code: "rev", title: "Complete 6 revisions this week", target: 6, progress: revDone };
  else c = { code: "mocks2", title: "Take 2 mock tests this week", target: 2, progress: mocks };
  const done = c.progress >= c.target;
  const xp = 75;
  if (done) await awardXp(userId, today, [{ type: "CHALLENGE", amount: xp, reason: `Weekly challenge: ${c.title}`, dedupeKey: `challenge:${ws}` }]);
  return { ...c, progress: Math.min(c.progress, c.target), done, xp, weekStart: ws };
}
