import { prisma } from "@/server/db";
import { addDays, diffDays } from "@/lib/engine/dates";
import { applyReview, initialSrs, reviewQuality } from "@/lib/engine/revision";
import { revisionXp } from "@/lib/engine/xp";
import { awardXp } from "./gamification.service";

/** First learning of a topic: put it on the 1-3-7-14-30 ladder. No-op if already scheduled. */
export async function scheduleInitialRevision(userId: string, topicId: string, today: string) {
  const st = await prisma.userTopicState.findUnique({ where: { userId_topicId: { userId, topicId } } });
  if (st?.nextRevisionOn) return st;
  const srs = initialSrs(today);
  const updated = await prisma.userTopicState.upsert({
    where: { userId_topicId: { userId, topicId } },
    create: { userId, topicId, status: "COMPLETED", completedAt: new Date(), ...srs },
    update: { ...srs },
  });
  await prisma.revisionEvent.create({ data: { userId, topicId, scheduledOn: srs.nextRevisionOn!, stage: 0 } });
  return updated;
}

/** Record a revision and schedule the next one, adapting to recall/accuracy. */
export async function completeRevision(userId: string, topicId: string, input: { accuracy: number | null; recall: number | null }, today: string, taskId?: string | null) {
  const st = await prisma.userTopicState.findUnique({ where: { userId_topicId: { userId, topicId } } });
  if (!st) {
    await scheduleInitialRevision(userId, topicId, today);
    return { outcome: "HELD" as const, nextRevisionOn: addDays(today, 1), xp: [] };
  }
  const quality = reviewQuality(input.accuracy, input.recall);
  const next = applyReview({ srsStage: st.srsStage, easeFactor: st.easeFactor, intervalDays: st.intervalDays, lapses: st.lapses, nextRevisionOn: st.nextRevisionOn }, quality, today);

  // Close the earliest open event (the one that was due), then open the next one.
  const open = await prisma.revisionEvent.findFirst({ where: { userId, topicId, completedOn: null }, orderBy: { scheduledOn: "asc" } });
  const event = open
    ? await prisma.revisionEvent.update({ where: { id: open.id }, data: { completedOn: today, accuracy: input.accuracy, recall: input.recall, outcome: next.outcome, taskId: taskId ?? null } })
    : await prisma.revisionEvent.create({ data: { userId, topicId, scheduledOn: today, stage: st.srsStage, completedOn: today, accuracy: input.accuracy, recall: input.recall, outcome: next.outcome, taskId: taskId ?? null } });
  // Any other stale open events for this topic are superseded by the new schedule.
  await prisma.revisionEvent.deleteMany({ where: { userId, topicId, completedOn: null, id: { not: event.id } } });
  await prisma.revisionEvent.create({ data: { userId, topicId, scheduledOn: next.nextRevisionOn!, stage: next.srsStage } });

  await prisma.userTopicState.update({
    where: { id: st.id },
    data: { srsStage: next.srsStage, easeFactor: next.easeFactor, intervalDays: next.intervalDays, lapses: next.lapses, nextRevisionOn: next.nextRevisionOn, lastStudiedAt: new Date() },
  });
  const xp = await awardXp(userId, today, [revisionXp(event.id)]);
  return { outcome: next.outcome, nextRevisionOn: next.nextRevisionOn!, xp };
}

export async function revisionQueue(userId: string, examId: string, today: string) {
  const states = await prisma.userTopicState.findMany({
    where: { userId, nextRevisionOn: { not: null, lte: addDays(today, 7) }, topic: { subject: { examId } } },
    include: { topic: { include: { subject: true } } },
    orderBy: { nextRevisionOn: "asc" },
  });
  return states.map((s) => ({
    topicId: s.topicId,
    topicName: s.topic.name,
    subjectName: s.topic.subject.name,
    subjectId: s.topic.subjectId,
    nextRevisionOn: s.nextRevisionOn!,
    overdueDays: Math.max(0, diffDays(s.nextRevisionOn!, today)),
    due: s.nextRevisionOn! <= today,
    stage: s.srsStage,
    lapses: s.lapses,
  }));
}

/** On-time revision rate over the last 30 days (a revision is on time if done within 1 day of its due date). */
export async function revisionHealth(userId: string, today: string) {
  const events = await prisma.revisionEvent.findMany({ where: { userId, scheduledOn: { gte: addDays(today, -30), lte: addDays(today, -1) } } });
  const due = events.length;
  const onTime = events.filter((e) => e.completedOn && diffDays(e.scheduledOn, e.completedOn) <= 1).length;
  const overdueOpen = events.filter((e) => !e.completedOn).length;
  return { due, onTime, overdueOpen };
}
