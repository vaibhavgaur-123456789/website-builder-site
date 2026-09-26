import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { addDays, dayKey } from "@/lib/engine/dates";
import { MISTAKE_FIXES, MISTAKE_LABELS, topRecurring, type MistakeCategory } from "@/lib/engine/mistakes";
import { parseJson } from "@/lib/json";

export async function listMistakes(userId: string, filter: { category?: string; resolved?: boolean; topicId?: string } = {}) {
  const rows = await prisma.mistake.findMany({
    where: { userId, ...(filter.category ? { category: filter.category } : {}), ...(filter.resolved !== undefined ? { resolved: filter.resolved } : {}), ...(filter.topicId ? { topicId: filter.topicId } : {}) },
    include: { question: true, topic: { include: { subject: true } }, attempt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((m) => ({
    id: m.id,
    category: m.category as MistakeCategory,
    autoCategory: m.autoCategory as MistakeCategory,
    userCorrected: m.userCorrected,
    note: m.note,
    resolved: m.resolved,
    reviewCount: m.reviewCount,
    nextReviewOn: m.nextReviewOn,
    createdAt: m.createdAt,
    topic: m.topic.name,
    subject: m.topic.subject.name,
    question: { id: m.question.id, stem: m.question.stem, options: parseJson<string[]>(m.question.options, []), correctIndex: m.question.correctIndex, explanation: m.question.explanation },
    selectedIndex: m.attempt.selectedIndex,
    timeSpentSec: m.attempt.timeSpentSec,
    confidence: m.attempt.confidence,
  }));
}

export async function mistakeSummary(userId: string) {
  const rows = await prisma.mistake.findMany({ where: { userId }, select: { category: true, resolved: true, topicId: true, topic: { select: { name: true } } } });
  const open = rows.filter((r) => !r.resolved);
  const byCategory = Object.keys(MISTAKE_LABELS).map((c) => ({ category: c as MistakeCategory, label: MISTAKE_LABELS[c as MistakeCategory], count: open.filter((r) => r.category === c).length }));
  const topicCounts = new Map<string, { name: string; count: number }>();
  for (const r of open) topicCounts.set(r.topicId, { name: r.topic.name, count: (topicCounts.get(r.topicId)?.count ?? 0) + 1 });
  return {
    total: rows.length,
    open: open.length,
    resolved: rows.length - open.length,
    byCategory,
    top: topRecurring(open.map((r) => r.category as MistakeCategory)),
    topTopics: [...topicCounts.entries()].map(([topicId, v]) => ({ topicId, ...v })).sort((a, b) => b.count - a.count).slice(0, 5),
    fixes: MISTAKE_FIXES,
  };
}

export async function updateMistake(userId: string, id: string, patch: { category?: string; note?: string; resolved?: boolean }) {
  const m = await prisma.mistake.findUnique({ where: { id } });
  if (!m || m.userId !== userId) throw notFound("Mistake");
  return prisma.mistake.update({
    where: { id },
    data: {
      ...(patch.category ? { category: patch.category, userCorrected: patch.category !== m.autoCategory } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.resolved !== undefined ? { resolved: patch.resolved } : {}),
    },
  });
}

/** Re-solve a mistake. Correct → resolved. Wrong → comes back in 2 days. */
export async function reviewMistake(userId: string, id: string, selectedIndex: number) {
  const m = await prisma.mistake.findUnique({ where: { id }, include: { question: true } });
  if (!m || m.userId !== userId) throw notFound("Mistake");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dayKey(new Date(), user.timezone);
  const correct = selectedIndex === m.question.correctIndex;
  await prisma.mistake.update({ where: { id }, data: { reviewCount: { increment: 1 }, resolved: correct, nextReviewOn: correct ? null : addDays(today, 2) } });
  return { correct, correctIndex: m.question.correctIndex, explanation: m.question.explanation };
}
