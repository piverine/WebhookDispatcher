import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import { pool } from "../src/db.js";

describe("Health Route", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("returns ok: true when database is healthy", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ ok: true });
    await app.close();
  });
});
