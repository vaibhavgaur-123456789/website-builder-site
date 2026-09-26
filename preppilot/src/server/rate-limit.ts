import { prisma } from "@/server/db";
import { tooMany } from "@/server/errors";

/**
 * Fixed-window rate limiter stored in the database, so it holds across server instances.
 * Throws a 429 AppError when the limit is exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!bucket || bucket.resetAt < now) {
    await prisma.rateLimitBucket.upsert({ where: { key }, create: { key, count: 1, resetAt }, update: { count: 1, resetAt } });
    return;
  }
  if (bucket.count >= limit) throw tooMany();
  await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
}
