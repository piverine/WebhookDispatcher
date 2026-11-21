import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/dispatcher_test",
      REDIS_URL: process.env.TEST_REDIS_URL || "redis://localhost:6379",
      ALLOW_PRIVATE_DESTINATIONS: "true",
    },
  },
});
