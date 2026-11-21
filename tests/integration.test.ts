import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";
import { WorkerManager } from "../src/worker/worker.js";
import { getJobWithAttempts } from "../src/queue/jobs.repo.js";
import { TokenBucketLimiter } from "../src/ratelimit/tokenBucket.js";
import { config } from "../src/config.js";

describe("Phase 6: End-to-End Integration Test", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverUrl: string;
  let worker: WorkerManager;
  let originalBackoff: number;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    serverUrl = address;

    // Use fast backoff base for rapid integration testing
    originalBackoff = config.backoffBaseMs;
    config.backoffBaseMs = 150;

    worker = new WorkerManager(undefined, new TokenBucketLimiter(100, 100));
    worker.start();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE jobs CASCADE;");
  });

  afterAll(async () => {
    config.backoffBaseMs = originalBackoff;
    await worker.stop();
    await app.close();
    await pool.end();
  });

  it("CHECK: Integration - dispatch to mock flaky, poll job until succeeded", async () => {
    const eventId = `evt_e2e_flaky_${Date.now()}`;
    const destinationUrl = `${serverUrl}/mock/receiver?mode=flaky&failFirst=2`;

    // 1. Dispatch
    const dispatchRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl,
        eventId,
        payload: { test: "e2e_integration" },
      },
    });

    expect(dispatchRes.statusCode).toBe(202);
    const { jobId } = JSON.parse(dispatchRes.body);

    // 2. Poll until job reaches succeeded (background worker handles all retries)
    const maxWait = 25000;
    const start = Date.now();
    let finalState: Awaited<ReturnType<typeof getJobWithAttempts>> = null;

    while (Date.now() - start < maxWait) {
      finalState = await getJobWithAttempts(jobId);
      if (finalState?.job.status === "succeeded") {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(finalState?.job.status).toBe("succeeded");
    expect(finalState?.job.attempt_count).toBe(3);
    expect(finalState?.attempts.length).toBe(3);
    expect(finalState?.attempts[0].response_code).toBe(500);
    expect(finalState?.attempts[1].response_code).toBe(500);
    expect(finalState?.attempts[2].response_code).toBe(200);
  });
});

