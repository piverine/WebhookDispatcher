import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";

describe("Phase 1: Database and Ingestion", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("CHECK: dispatch returns 202 fast and row exists", async () => {
    const eventId = `evt_test_${Date.now()}`;
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl: "https://example.com/webhook",
        eventId,
        payload: { action: "order_created", amount: 150 },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("queued");
    expect(body.jobId).toBeDefined();

    // Verify row exists via GET /api/webhooks/jobs/:jobId
    const getRes = await app.inject({
      method: "GET",
      url: `/api/webhooks/jobs/${body.jobId}`,
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.jobId).toBe(body.jobId);
    expect(getBody.eventId).toBe(eventId);
    expect(getBody.status).toBe("queued");
    expect(getBody.attemptCount).toBe(0);
    expect(Array.isArray(getBody.attempts)).toBe(true);
  });

  it("CHECK: bad body returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload: {
        destinationUrl: "not-a-valid-url",
        // missing eventId and payload
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("validation_failed");
    expect(body.details).toBeDefined();
  });

  it("CHECK: duplicate eventId returns same jobId with duplicate: true", async () => {
    const eventId = `evt_dup_${Date.now()}`;
    const payload = {
      destinationUrl: "https://example.com/webhook",
      eventId,
      payload: { user: "alice" },
    };

    const firstRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload,
    });
    expect(firstRes.statusCode).toBe(202);
    const firstBody = JSON.parse(firstRes.body);
    expect(firstBody.duplicate).toBeUndefined();

    const secondRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/dispatch",
      payload,
    });
    expect(secondRes.statusCode).toBe(202);
    const secondBody = JSON.parse(secondRes.body);
    expect(secondBody.jobId).toBe(firstBody.jobId);
    expect(secondBody.duplicate).toBe(true);
  });
});
