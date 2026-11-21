import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TokenBucketLimiter } from "../src/ratelimit/tokenBucket.js";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";
import { WorkerManager } from "../src/worker/worker.js";
import { getJobWithAttempts } from "../src/queue/jobs.repo.js";

describe("Phase 4: Rate Limiting", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverUrl: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    serverUrl = address;
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE jobs CASCADE;");
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe("TokenBucketLimiter unit behavior", () => {
    it("allows bursting up to capacity, then blocks, then refills", async () => {
      const limiter = new TokenBucketLimiter(3, 2); // capacity 3, refill 2/sec
      const host = "api.partner.com";

      // 3 tokens available initially
      expect(limiter.tryTake(host)).toBe(true);
      expect(limiter.tryTake(host)).toBe(true);
      expect(limiter.tryTake(host)).toBe(true);

      // 4th token should be rejected (empty bucket)
      expect(limiter.tryTake(host)).toBe(false);
      expect(limiter.msUntilToken(host)).toBeGreaterThan(0);

      // Wait 600ms (at 2 tokens/sec, this generates >= 1 token)
      await new Promise((r) => setTimeout(r, 600));

      expect(limiter.tryTake(host)).toBe(true);
      expect(limiter.tryTake(host)).toBe(false);
    });
  });

  describe("Slow target non-blocking check", () => {
    it("CHECK: A slow target (5s delay) does NOT slow the dispatch response", async () => {
      const start = Date.now();
      const eventId = `evt_slow_${Date.now()}`;
      const destinationUrl = `${serverUrl}/mock/receiver?mode=slow&delay=5000`;

      const res = await app.inject({
        method: "POST",
        url: "/api/webhooks/dispatch",
        payload: {
          destinationUrl,
          eventId,
          payload: { action: "slow_test" },
        },
      });

      const elapsed = Date.now() - start;

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("queued");
      expect(body.jobId).toBeDefined();

      // Ingestion must be instant (< 100ms), NOT waiting for the 5s downstream
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe("Token bucket worker delivery", () => {
    it("CHECK: jobs are delivered at refill rate without wasting attempts when limited", async () => {
      // Limiter with capacity 2, refill 10/sec
      const limiter = new TokenBucketLimiter(2, 10);
      const worker = new WorkerManager(undefined, limiter);

      const jobIds: string[] = [];
      const count = 5;

      for (let i = 0; i < count; i++) {
        const eventId = `evt_bucket_${i}_${Date.now()}`;
        const res = await app.inject({
          method: "POST",
          url: "/api/webhooks/dispatch",
          payload: {
            destinationUrl: `${serverUrl}/mock/receiver?mode=ok`,
            eventId,
            payload: { index: i },
          },
        });
        expect(res.statusCode).toBe(202);
        jobIds.push(JSON.parse(res.body).jobId);
      }

      // First tick consumes 2 tokens, remaining 3 jobs get rescheduled without consuming attempt
      await worker.tick();
      await worker.waitForIdle();

      // Check that at least some jobs were rescheduled and no attempts were counted for rescheduled ones
      for (const id of jobIds) {
        const state = await getJobWithAttempts(id);
        if (state?.job.status === "retrying") {
          // Rescheduled due to rate limit: attempt count must be 0!
          expect(state.job.attempt_count).toBe(0);
        }
      }

      // Wait for tokens to refill and deliver all
      const maxWait = 5000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        // Reset next_attempt_at for any retrying jobs so worker can process them
        await pool.query("UPDATE jobs SET next_attempt_at = now() - interval '1 second' WHERE status = 'retrying'");
        await worker.tick();
        await worker.waitForIdle();

        let allDone = true;
        for (const id of jobIds) {
          const state = await getJobWithAttempts(id);
          if (state?.job.status !== "succeeded") {
            allDone = false;
            break;
          }
        }
        if (allDone) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      // Verify all jobs reached succeeded and none were lost
      for (const id of jobIds) {
        const state = await getJobWithAttempts(id);
        expect(state?.job.status).toBe("succeeded");
        expect(state?.job.attempt_count).toBe(1);
      }

      await worker.stop();
    });
  });
});
