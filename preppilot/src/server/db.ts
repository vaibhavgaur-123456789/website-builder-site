import { PrismaClient } from "@prisma/client";

// One client per process (Next dev hot-reload would otherwise create many).
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
