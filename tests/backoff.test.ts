import { describe, it, expect } from "vitest";
import { computeBackoffDelay } from "../src/worker/backoff.js";

describe("Phase 3: Backoff Calculations", () => {
  it("returns exact 2s, 4s, 8s when jitter is 0", () => {
    expect(computeBackoffDelay(1, 2000, 0)).toBe(2000);
    expect(computeBackoffDelay(2, 2000, 0)).toBe(4000);
    expect(computeBackoffDelay(3, 2000, 0)).toBe(8000);
  });

  it("adds bounded jitter between 0 and 250ms by default", () => {
    for (let i = 0; i < 50; i++) {
      const delay1 = computeBackoffDelay(1, 2000);
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2250);

      const delay2 = computeBackoffDelay(2, 2000);
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(4250);

      const delay3 = computeBackoffDelay(3, 2000);
      expect(delay3).toBeGreaterThanOrEqual(8000);
      expect(delay3).toBeLessThanOrEqual(8250);
    }
  });

  it("handles custom base backoff", () => {
    expect(computeBackoffDelay(1, 100, 0)).toBe(100);
    expect(computeBackoffDelay(2, 100, 0)).toBe(200);
    expect(computeBackoffDelay(3, 100, 0)).toBe(400);
  });
});
