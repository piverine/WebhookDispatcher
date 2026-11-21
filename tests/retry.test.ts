import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";
import { WorkerManager } from "../src/worker/worker.js";
import { getJobWithAttempts } from "../src/queue/jobs.repo.js";
import { TokenBucketLimiter } from "../src/ratelimit/tokenBucket.js";

describe("Phase 3: Retry, Backoff, and Failure Classification", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverUrl: string;
  let worker: WorkerManager;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    serverUrl = address;
    worker = new WorkerManager(undefined, new TokenBucketLimiter(100, 100));
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE jobs CASCADE;");
  });

  afterAll(async () => {
    await worker.stop();
    await app.close();
    await pool.end();
  });

  it("CHECK: mode=fail gives 4 attempts then failed", async () => {
    const eventId = `evt_fail_test_${Date.now()}`;
    const destinationUrl = `${serverUrl}/mock/receiver?mode=fail`;

    const dispatchRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: { destinationUrl, eventId, payload: { mode: "fail" } },
    });
    expect(dispatchRes.statusCode).toBe(202);
    const { jobId } = JSON.parse(dispatchRes.body);

    // Simulate the 4 attempts by running worker ticks and advancing next_attempt_at
    for (let attempt = 1; attempt <= 4; attempt++) {
      // Ensure job is ready for claim
      await pool.query("UPDATE jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [jobId]);
      await worker.tick();
      await worker.waitForIdle();

      const res = await getJobWithAttempts(jobId);
      expect(res?.job.attempt_count).toBe(attempt);
      if (attempt < 4) {
        expect(res?.job.status).toBe("retrying");
      } else {
        expect(res?.job.status).toBe("failed");
      }
    }

    const finalResult = await getJobWithAttempts(jobId);
    expect(finalResult?.job.status).toBe("failed");
    expect(finalResult?.job.attempt_count).toBe(4);
    expect(finalResult?.attempts.length).toBe(4);
    for (const att of finalResult!.attempts) {
      expect(att.response_code).toBe(500);
      expect(att.error).toBeDefined();
    }
  });

  it("CHECK: flaky&failFirst=2 ends succeeded on attempt 3", async () => {
    const eventId = `evt_flaky_test_${Date.now()}`;
    const destinationUrl = `${serverUrl}/mock/receiver?mode=flaky&failFirst=2`;

    const dispatchRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: { destinationUrl, eventId, payload: { mode: "flaky" } },
    });
    expect(dispatchRes.statusCode).toBe(202);
    const { jobId } = JSON.parse(dispatchRes.body);

    // Attempt 1: should fail (failFirst=2)
    await pool.query("UPDATE jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [jobId]);
    await worker.tick();
    await worker.waitForIdle();
    let state = await getJobWithAttempts(jobId);
    expect(state?.job.attempt_count).toBe(1);
    expect(state?.job.status).toBe("retrying");

    // Attempt 2: should fail (failFirst=2)
    await pool.query("UPDATE jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [jobId]);
    await worker.tick();
    await worker.waitForIdle();
    state = await getJobWithAttempts(jobId);
    expect(state?.job.attempt_count).toBe(2);
    expect(state?.job.status).toBe("retrying");

    // Attempt 3: should succeed
    await pool.query("UPDATE jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [jobId]);
    await worker.tick();
    await worker.waitForIdle();
    state = await getJobWithAttempts(jobId);
    expect(state?.job.attempt_count).toBe(3);
    expect(state?.job.status).toBe("succeeded");
    expect(state?.attempts.length).toBe(3);
    expect(state?.attempts[0].response_code).toBe(500);
    expect(state?.attempts[1].response_code).toBe(500);
    expect(state?.attempts[2].response_code).toBe(200);
  });

  it("CHECK: 4xx non-retryable response (e.g. 404) fails immediately with 1 attempt", async () => {
    const eventId = `evt_404_test_${Date.now()}`;
    const destinationUrl = `${serverUrl}/non-existent-path`;

    const dispatchRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: { destinationUrl, eventId, payload: { test: 404 } },
    });
    expect(dispatchRes.statusCode).toBe(202);
    const { jobId } = JSON.parse(dispatchRes.body);

    await worker.tick();
    await worker.waitForIdle();

    const state = await getJobWithAttempts(jobId);
    expect(state?.job.status).toBe("failed");
    expect(state?.job.attempt_count).toBe(1);
    expect(state?.attempts.length).toBe(1);
    expect(state?.attempts[0].response_code).toBe(404);
  });
});
