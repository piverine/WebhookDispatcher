import { describe, it, expect, beforeEach } from "vitest";
import { DestinationCircuitBreaker } from "../src/lib/circuitBreaker.js";

describe("Advanced: Destination Circuit Breaker", () => {
  let cb: DestinationCircuitBreaker;

  beforeEach(() => {
    // 3 failure threshold, 200ms cooldown for fast testing
    cb = new DestinationCircuitBreaker(3, 200);
  });

  it("CHECK: starts CLOSED and allows requests", () => {
    expect(cb.isOpen("api.stripe.com")).toBe(false);
    expect(cb.getStatus("api.stripe.com").state).toBe("CLOSED");
  });

  it("CHECK: trips OPEN after reaching consecutive failure threshold", () => {
    const host = "failing-api.internal";

    cb.recordFailure(host);
    expect(cb.isOpen(host)).toBe(false);

    cb.recordFailure(host);
    expect(cb.isOpen(host)).toBe(false);

    const trip = cb.recordFailure(host);
    expect(trip.tripped).toBe(true);
    expect(cb.isOpen(host)).toBe(true);
    expect(cb.getStatus(host).state).toBe("OPEN");
    expect(cb.getCooldownRemainingMs(host)).toBeGreaterThan(0);
  });

  it("CHECK: transitions from OPEN to HALF_OPEN after cooldown and resets on success", async () => {
    const host = "recovering-api.internal";
    cb.recordFailure(host);
    cb.recordFailure(host);
    cb.recordFailure(host);

    expect(cb.isOpen(host)).toBe(true);

    // Wait for cooldown (200ms)
    await new Promise((resolve) => setTimeout(resolve, 220));

    // isOpen returns false when transitioning to HALF_OPEN to allow probe
    expect(cb.isOpen(host)).toBe(false);
    expect(cb.getStatus(host).state).toBe("HALF_OPEN");

    // Success resets to CLOSED
    cb.recordSuccess(host);
    expect(cb.getStatus(host).state).toBe("CLOSED");
    expect(cb.getStatus(host).consecutiveFailures).toBe(0);
  });
});
