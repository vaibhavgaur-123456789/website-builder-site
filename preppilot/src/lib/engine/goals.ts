import { addDays, diffDays, weekStart } from "./dates";

export interface CascadeInput {
  today: string;
  examDate: string;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  topicsRemaining: number;
}

export interface GoalDraft {
  level: "EXAM" | "MONTHLY" | "WEEKLY" | "DAILY";
  metric: "MINUTES" | "TOPICS_COMPLETED" | "MOCKS";
  title: string;
  target: number;
  periodStart: string;
  periodEnd: string;
}

/** Exam goal → this month → this week → today. Each level is derived from the one above. */
export function cascadeGoals(i: CascadeInput): GoalDraft[] {
  const daysLeft = Math.max(1, diffDays(i.today, i.examDate));
  const monthEnd = addDays(i.today, Math.min(29, daysLeft));
  const wStart = weekStart(i.today);
  const wEnd = addDays(wStart, 6);
  const topicsPerDay = i.topicsRemaining / Math.max(1, Math.floor(daysLeft * 0.85));
  const monthTopics = Math.ceil(topicsPerDay * Math.min(30, daysLeft));
  const weekTopics = Math.ceil(topicsPerDay * 7);
  return [
    { level: "EXAM", metric: "TOPICS_COMPLETED", title: `Complete the remaining ${i.topicsRemaining} topics before the exam`, target: i.topicsRemaining, periodStart: i.today, periodEnd: i.examDate },
    { level: "MONTHLY", metric: "TOPICS_COMPLETED", title: `Complete ${monthTopics} topics this month`, target: monthTopics, periodStart: i.today, periodEnd: monthEnd },
    { level: "WEEKLY", metric: "MINUTES", title: `Study ${Math.round(i.weeklyGoalMinutes / 60)} hours this week`, target: i.weeklyGoalMinutes, periodStart: wStart, periodEnd: wEnd },
    { level: "WEEKLY", metric: "TOPICS_COMPLETED", title: `Complete ${weekTopics} topics this week`, target: weekTopics, periodStart: wStart, periodEnd: wEnd },
    { level: "DAILY", metric: "MINUTES", title: `Study ${i.dailyGoalMinutes} minutes today`, target: i.dailyGoalMinutes, periodStart: i.today, periodEnd: i.today },
  ];
}
