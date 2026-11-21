import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";

describe("Advanced: Prometheus Metrics Exposition", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("CHECK: GET /metrics exposes valid Prometheus text format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    const body = res.body;
    expect(body).toContain("# HELP webhook_jobs_enqueued_total");
    expect(body).toContain("# TYPE webhook_jobs_enqueued_total counter");
    expect(body).toContain("webhook_jobs_enqueued_total");

    expect(body).toContain("# HELP webhook_delivery_attempts_total");
    expect(body).toContain('webhook_delivery_attempts_total{status="success"}');

    expect(body).toContain("# HELP webhook_queue_depth");
    expect(body).toContain('webhook_queue_depth{status="queued"}');
  });
});
