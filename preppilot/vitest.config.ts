import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { DATABASE_URL: "file:./test-integration.db", AUTH_SECRET: "test-secret-test-secret-test-secret-123456", APP_URL: "http://localhost:3000" },
    globalSetup: ["tests/global-setup.ts"],
    // Integration tests share one SQLite file; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
