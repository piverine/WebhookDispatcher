import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";
import { WorkerManager } from "../src/worker/worker.js";
import { getJobWithAttempts } from "../src/queue/jobs.repo.js";
import { TokenBucketLimiter } from "../src/ratelimit/tokenBucket.js";
import { config } from "../src/config.js";
import { signPayload } from "../src/lib/signature.js";

describe("Phase 5: Hardening and Crash Recovery", () => {
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

  it("CHECK: Crash recovery - job stuck in 'processing' with expired locked_until is recovered", async () => {
    const eventId = `evt_crashed_${Date.now()}`;
    const destinationUrl = `${serverUrl}/mock/receiver?mode=ok`;

    // Simulate a crashed worker process that left a job in 'processing' with locked_until expired
    const insertRes = await pool.query(
      `
      INSERT INTO jobs (event_id, destination_url, destination_host, payload, status, locked_until, next_attempt_at)
      VALUES ($1, $2, $3, $4, 'processing', now() - interval '5 seconds', now() - interval '10 seconds')
      RETURNING id;
      `,
      [eventId, destinationUrl, "127.0.0.1", JSON.stringify({ crashRecovery: true })]
    );

    const jobId = insertRes.rows[0].id;

    // Verify initial state
    let state = await getJobWithAttempts(jobId);
    expect(state?.job.status).toBe("processing");

    // Worker tick should detect expired lock, reclaim job, and deliver it
    await worker.tick();
    await worker.waitForIdle();

    state = await getJobWithAttempts(jobId);
    expect(state?.job.status).toBe("succeeded");
    expect(state?.job.attempt_count).toBe(1);
    expect(state?.attempts.length).toBe(1);
    expect(state?.attempts[0].status).toBe("success");
    expect(state?.attempts[0].response_code).toBe(200);
  });

  it("CHECK: Request body limit - payloads over 100 KB return 413 Payload Too Large", async () => {
    // Generate 105 KB payload
    const largeString = "a".repeat(105 * 1024);

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl: "https://example.com/webhook",
        eventId: `evt_large_${Date.now()}`,
        payload: { bigData: largeString },
      },
    });

    expect(res.statusCode).toBe(413);
  });

  it("CHECK: Redirect handling - 3xx redirect is not followed and marked failed immediately", async () => {
    const eventId = `evt_redirect_${Date.now()}`;
    const destinationUrl = `${serverUrl}/mock/receiver?mode=redirect`;

    const dispatchRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl,
        eventId,
        payload: { action: "test_redirect" },
      },
    });

    expect(dispatchRes.statusCode).toBe(202);
    const { jobId } = JSON.parse(dispatchRes.body);

    await worker.tick();
    await worker.waitForIdle();

    const state = await getJobWithAttempts(jobId);
    expect(state?.job.status).toBe("failed");
    expect(state?.job.attempt_count).toBe(1);
    expect(state?.attempts.length).toBe(1);
    expect(state?.attempts[0].response_code).toBe(302);
  });

  it("CHECK: Optional HMAC signing - sends X-Webhook-Signature when secret configured", async () => {
    // Temporarily configure signing secret
    const originalSecret = config.webhookSigningSecret;
    config.webhookSigningSecret = "test-secret-key-123";

    try {
      const eventId = `evt_hmac_${Date.now()}`;
      const payload = { event: "payment.completed", amount: 9900 };
      const destinationUrl = `${serverUrl}/mock/receiver?mode=ok`;

      const dispatchRes = await app.inject({
        method: "POST",
        url: "/api/webhooks/dispatch",
        payload: {
          destinationUrl,
          eventId,
          payload,
        },
      });

      expect(dispatchRes.statusCode).toBe(202);
      const { jobId } = JSON.parse(dispatchRes.body);

      await worker.tick();
      await worker.waitForIdle();

      // Check stats from mock receiver to verify received headers
      const statsRes = await app.inject({
        method: "GET",
        url: "/mock/receiver/stats",
      });

      const stats = JSON.parse(statsRes.body);
      expect(stats.lastHeaders).toBeDefined();
      expect(stats.lastHeaders["x-webhook-event-id"]).toBe(eventId);
      expect(stats.lastHeaders["x-webhook-attempt"]).toBe("1");

      const expectedSignature = signPayload(JSON.stringify(payload), "test-secret-key-123");
      expect(stats.lastHeaders["x-webhook-signature"]).toBe(expectedSignature);
    } finally {
      config.webhookSigningSecret = originalSecret;
    }
  });
});

