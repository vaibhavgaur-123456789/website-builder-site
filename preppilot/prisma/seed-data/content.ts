import type { PrismaClient } from "@prisma/client";
import { ACHIEVEMENTS, EXAMS, type ExamDef, type TopicDef } from "./exams";
import { BANKS } from "./static-questions";
import { generate } from "./generators";

const DEFAULT_GEN_COUNT = 12;

async function createTopic(prisma: PrismaClient, examSlug: string, subjectId: string, def: TopicDef, order: number, parentId: string | null): Promise<string[]> {
  const topic = await prisma.topic.create({
    data: { subjectId, parentId, slug: def.slug, name: def.name, order, weightage: def.weightage, difficulty: def.difficulty, estimatedMinutes: def.minutes },
  });
  const ids: string[] = [];
  const rows: { stem: string; options: string[]; correctIndex: number; explanation: string; difficulty: number; expectedSeconds: number }[] = [];
  if (def.gen) rows.push(...generate(def.gen, def.count ?? DEFAULT_GEN_COUNT, `${examSlug}:${def.slug}`));
  if (def.bank) {
    for (const [stem, options, correctIndex, explanation, difficulty] of BANKS[def.bank] ?? []) {
      rows.push({ stem, options, correctIndex, explanation, difficulty, expectedSeconds: 20 + difficulty * 10 });
    }
  }
  for (const q of rows) {
    const created = await prisma.question.create({
      data: { topicId: topic.id, stem: q.stem, options: JSON.stringify(q.options), correctIndex: q.correctIndex, explanation: q.explanation, difficulty: q.difficulty, expectedSeconds: q.expectedSeconds, source: def.gen ? "PrepPilot template (computed)" : "PrepPilot original" },
    });
    ids.push(created.id);
  }
  let childOrder = 0;
  for (const child of def.children ?? []) ids.push(...(await createTopic(prisma, examSlug, subjectId, child, childOrder++, topic.id)));
  return ids;
}

/** Interleave several lists round-robin so a mock mixes topics evenly. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

async function seedExam(prisma: PrismaClient, def: ExamDef) {
  const existing = await prisma.exam.findUnique({ where: { slug: def.slug } });
  if (existing) return { exam: existing, created: false };

  const exam = await prisma.exam.create({
    data: {
      slug: def.slug, name: def.name, shortName: def.shortName, category: def.category, description: def.description,
      durationMinutes: def.durationMinutes, totalQuestions: def.totalQuestions, marksPerQuestion: def.marksPerQuestion, negativeMarking: def.negativeMarking,
    },
  });

  const sectionPools: { name: string; count: number; pool: string[] }[] = [];
  let subjectOrder = 0;
  for (const [si, sec] of def.sections.entries()) {
    const section = await prisma.examSection.create({ data: { examId: exam.id, name: sec.name, order: si, questionCount: sec.questionCount } });
    const perTopic: string[][] = [];
    for (const s of sec.subjects) {
      const subject = await prisma.subject.create({
        data: { examId: exam.id, sectionId: section.id, slug: s.slug, name: s.name, order: subjectOrder++, weightage: s.weightage, isQuantitative: !!s.quant, isMemoryBased: !!s.memory },
      });
      for (const [ti, td] of s.topics.entries()) perTopic.push(await createTopic(prisma, def.slug, subject.id, td, ti, null));
    }
    sectionPools.push({ name: sec.name, count: sec.questionCount, pool: interleave(perTopic) });
  }

  const mq = (mockId: string, ids: string[]) =>
    prisma.mockQuestion.createMany({ data: ids.map((questionId, order) => ({ mockId, questionId, order, marks: def.marksPerQuestion })) });
  const take = (pool: string[], n: number, offset: number) => {
    const out: string[] = [];
    for (let i = 0; i < Math.min(n, pool.length); i++) out.push(pool[(offset + i) % pool.length]);
    return [...new Set(out)];
  };

  for (let m = 0; m < def.fullMocks; m++) {
    const ids = sectionPools.flatMap((s) => take(s.pool, s.count, m * s.count));
    const mock = await prisma.mock.create({ data: { examId: exam.id, title: `${def.shortName} Full Mock ${m + 1}`, type: "FULL", durationMinutes: def.durationMinutes } });
    await mq(mock.id, ids);
  }
  for (const s of sectionPools) {
    const mock = await prisma.mock.create({
      data: { examId: exam.id, title: `${def.shortName} Sectional: ${s.name}`, type: "SECTIONAL", durationMinutes: Math.max(10, Math.round((def.durationMinutes * s.count) / def.totalQuestions)) },
    });
    await mq(mock.id, take(s.pool, s.count, 7));
  }
  const diag = sectionPools.flatMap((s) => take(s.pool, 4, 3));
  const d = await prisma.mock.create({ data: { examId: exam.id, title: `${def.shortName} Baseline Diagnostic`, type: "DIAGNOSTIC", durationMinutes: Math.max(10, diag.length) } });
  await mq(d.id, diag);

  for (const b of def.referenceBenchmarks) {
    await prisma.benchmarkStat.create({ data: { examId: exam.id, metric: b.metric, value: b.value, p25: b.p25, p75: b.p75, sampleSize: 0, source: "REFERENCE" } });
  }
  return { exam, created: true };
}

export async function seedContent(prisma: PrismaClient) {
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({ where: { code: a.code }, update: { ...a }, create: { ...a } });
  }
  const results = [];
  for (const def of EXAMS) results.push(await seedExam(prisma, def));
  return results;
}
