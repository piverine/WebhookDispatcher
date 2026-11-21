import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";
import { enqueue, markFailed, getJobWithAttempts } from "../src/queue/jobs.repo.js";

describe("Advanced: Dead-Letter Queue (DLQ) and Redrive API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE jobs CASCADE;");
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("CHECK: lists failed jobs in DLQ", async () => {
    const { job } = await enqueue({
      eventId: `evt_dlq_1_${Date.now()}`,
      destinationUrl: "https://example.com/dlq1",
      destinationHost: "example.com",
      payload: { failed: true },
    });

    // Mark as failed
    await markFailed(job.id, 4, "HTTP status 500 (max attempts reached)");

    const res = await app.inject({
      method: "GET",
      url: "/api/webhooks/dlq",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.jobs.length).toBe(1);
    expect(body.jobs[0].jobId).toBe(job.id);
    expect(body.jobs[0].status).toBe("failed");
    expect(body.jobs[0].lastError).toContain("500");
  });

  it("CHECK: redrives a single failed job back into the queued state", async () => {
    const { job } = await enqueue({
      eventId: `evt_dlq_replay_${Date.now()}`,
      destinationUrl: "https://example.com/dlq_replay",
      destinationHost: "example.com",
      payload: { replay: true },
    });

    await markFailed(job.id, 4, "HTTP status 503");

    const replayRes = await app.inject({
      method: "POST",
      url: `/api/webhooks/dlq/${job.id}/replay`,
    });

    expect(replayRes.statusCode).toBe(200);
    const replayBody = JSON.parse(replayRes.body);
    expect(replayBody.status).toBe("queued");
    expect(replayBody.jobId).toBe(job.id);

    // Verify database state: status is queued, attempt_count is reset to 0
    const reloaded = await getJobWithAttempts(job.id);
    expect(reloaded?.job.status).toBe("queued");
    expect(reloaded?.job.attempt_count).toBe(0);
    expect(reloaded?.job.last_error).toBeNull();
  });

  it("CHECK: replay-all redrives all dead-letter jobs in batch", async () => {
    for (let i = 1; i <= 3; i++) {
      const { job } = await enqueue({
        eventId: `evt_dlq_batch_${i}_${Date.now()}`,
        destinationUrl: "https://example.com/dlq_batch",
        destinationHost: "example.com",
        payload: { batchIndex: i },
      });
      await markFailed(job.id, 4, "Network timeout");
    }

    const replayAllRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dlq/replay-all",
    });

    expect(replayAllRes.statusCode).toBe(200);
    const body = JSON.parse(replayAllRes.body);
    expect(body.status).toBe("replayed");
    expect(body.redrivenCount).toBe(3);

    // Verify DLQ is now empty
    const dlqListRes = await app.inject({
      method: "GET",
      url: "/api/webhooks/dlq",
    });
    const dlqList = JSON.parse(dlqListRes.body);
    expect(dlqList.total).toBe(0);
  });
});

