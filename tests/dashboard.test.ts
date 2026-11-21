import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import { pool, runMigrations } from "../src/db.js";

describe("Frontend Dashboard Route", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("serves the HTML dashboard on GET / when browser sends text/html", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Webhook Dispatcher Engine");
    expect(res.body).toContain("Dispatch Webhook");
    expect(res.body).toContain("Live Queue & Dispatched Jobs");
  });

  it("serves HTML dashboard on GET /dashboard", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/dashboard",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Webhook Dispatcher Engine");
  });

  it("serves JSON overview on GET / when requested without text/html (curl/API)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/",
      headers: {
        accept: "application/json",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("online");
    expect(body.endpoints).toBeDefined();
  });
});
