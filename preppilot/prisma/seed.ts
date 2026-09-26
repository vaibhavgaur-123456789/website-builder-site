// Seed entry point.
//   SEED_MODE=content  → exams, syllabus, questions, mocks, achievements, reference benchmarks
//   (default)          → content + demo accounts with ~3 weeks of simulated history
import { PrismaClient } from "@prisma/client";
import { seedContent } from "./seed-data/content";

const prisma = new PrismaClient();

async function main() {
  const results = await seedContent(prisma);
  for (const r of results) console.log(`${r.created ? "created" : "exists "}  ${r.exam.name}`);
  const counts = { questions: await prisma.question.count(), topics: await prisma.topic.count(), mocks: await prisma.mock.count() };
  console.log(`content: ${counts.topics} topics, ${counts.questions} questions, ${counts.mocks} mocks`);

  if (process.env.SEED_MODE !== "content") {
    const { seedDemo } = await import("./seed-data/demo");
    await seedDemo(prisma);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
