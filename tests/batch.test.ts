import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";

describe("Advanced: Batch Webhook Ingestion API", () => {
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

  it("CHECK: POST /api/webhooks/dispatch/batch enqueues up to 100 jobs atomically with 202 Accepted", async () => {
    const jobs = [
      {
        destinationUrl: "https://example.com/webhook1",
        eventId: `evt_batch_1_${Date.now()}`,
        payload: { item: 1 },
      },
      {
        destinationUrl: "https://example.com/webhook2",
        eventId: `evt_batch_2_${Date.now()}`,
        payload: { item: 2 },
      },
      {
        destinationUrl: "https://example.com/webhook3",
        eventId: `evt_batch_3_${Date.now()}`,
        payload: { item: 3 },
      },
    ];

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch/batch",
      payload: { jobs },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("queued");
    expect(body.total).toBe(3);
    expect(body.accepted).toBe(3);
    expect(body.duplicates).toBe(0);
    expect(body.jobs.length).toBe(3);
    expect(body.jobs[0].duplicate).toBe(false);
  });

  it("CHECK: Batch ingestion detects duplicate eventIds idempotently", async () => {
    const duplicateEventId = `evt_dupe_${Date.now()}`;
    const firstRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl: "https://example.com/webhook",
        eventId: duplicateEventId,
        payload: { first: true },
      },
    });
    expect(firstRes.statusCode).toBe(202);

    // Now send in a batch containing the duplicate
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch/batch",
      payload: {
        jobs: [
          {
            destinationUrl: "https://example.com/webhook",
            eventId: duplicateEventId,
            payload: { second: true },
          },
          {
            destinationUrl: "https://example.com/webhook",
            eventId: `evt_unique_${Date.now()}`,
            payload: { unique: true },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.accepted).toBe(1);
    expect(body.duplicates).toBe(1);
  });

  it("CHECK: Batch ingestion rejects batches over 100 or empty", async () => {
    const emptyRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch/batch",
      payload: { jobs: [] },
    });
    expect(emptyRes.statusCode).toBe(400);
  });
});
