import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// A throwaway SQLite file used only by the test suite. It never points at dev.db.
const FILE = path.resolve(__dirname, "../prisma/test-integration.db");
export const TEST_DB_URL = "file:./test-integration.db";

/** Fresh schema + exam content for every test run. */
export default function setup() {
  for (const f of [FILE, `${FILE}-journal`]) if (existsSync(f)) rmSync(f);
  const env = { ...process.env, DATABASE_URL: TEST_DB_URL, SEED_MODE: "content" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
