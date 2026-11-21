import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";
import { WorkerManager } from "../src/worker/worker.js";
import { getJobWithAttempts } from "../src/queue/jobs.repo.js";

describe("Phase 2: Worker and Delivery", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let serverUrl: string;
  let worker: WorkerManager;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    serverUrl = address;
    worker = new WorkerManager();
  });

  afterAll(async () => {
    await worker.stop();
    await app.close();
    await pool.end();
  });

  it("CHECK: job goes queued to succeeded, one attempt row exists", async () => {
    const eventId = `evt_worker_${Date.now()}`;
    const destinationUrl = `${serverUrl}/mock/receiver?mode=ok`;

    const dispatchRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl,
        eventId,
        payload: { test: "worker_delivery" },
      },
    });

    expect(dispatchRes.statusCode).toBe(202);
    const { jobId } = JSON.parse(dispatchRes.body);

    // Initial check: status is queued
    let result = await getJobWithAttempts(jobId);
    expect(result?.job.status).toBe("queued");

    // Run a worker tick to claim and deliver the job
    await worker.tick();

    // Poll until delivery completes (max 5 seconds)
    const maxWait = 5000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      result = await getJobWithAttempts(jobId);
      if (result?.job.status === "succeeded") {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(result?.job.status).toBe("succeeded");
    expect(result?.job.attempt_count).toBe(1);
    expect(result?.attempts.length).toBe(1);
    expect(result?.attempts[0].status).toBe("success");
    expect(result?.attempts[0].response_code).toBe(200);
    expect(result?.attempts[0].duration_ms).toBeGreaterThanOrEqual(0);
  });
});
