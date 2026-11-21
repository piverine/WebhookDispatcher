import { config } from "../config.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface HostCircuitState {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  openUntil: number;
}

export class DestinationCircuitBreaker {
  private hosts = new Map<string, HostCircuitState>();
  private failureThreshold: number;
  private cooldownMs: number;

  constructor(
    failureThreshold = config.circuitBreakerFailures,
    cooldownMs = config.circuitBreakerCooldownMs
  ) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
  }

  private getOrCreate(host: string): HostCircuitState {
    let entry = this.hosts.get(host);
    if (!entry) {
      entry = {
        state: "CLOSED",
        consecutiveFailures: 0,
        lastFailureTime: 0,
        openUntil: 0,
      };
      this.hosts.set(host, entry);
    }
    return entry;
  }

  /**
   * Check if the circuit for this host is OPEN (blocking requests).
   * Transitions OPEN -> HALF_OPEN when cooldown expires.
   */
  public isOpen(host: string): boolean {
    const entry = this.getOrCreate(host);
    if (entry.state === "OPEN") {
      if (Date.now() >= entry.openUntil) {
        entry.state = "HALF_OPEN";
        return false; // Allow a probe request through
      }
      return true;
    }
    return false;
  }

  /**
   * Get milliseconds remaining until an OPEN circuit transitions to HALF_OPEN.
   */
  public getCooldownRemainingMs(host: string): number {
    const entry = this.getOrCreate(host);
    if (entry.state === "OPEN") {
      return Math.max(0, entry.openUntil - Date.now());
    }
    return 0;
  }

  /**
   * Record a successful delivery to this host.
   * Resets failures and closes circuit.
   */
  public recordSuccess(host: string): void {
    const entry = this.getOrCreate(host);
    entry.consecutiveFailures = 0;
    entry.state = "CLOSED";
    entry.openUntil = 0;
  }

  /**
   * Record a delivery failure (5xx or timeout or network error).
   * If threshold is reached, trips circuit to OPEN.
   */
  public recordFailure(host: string): { tripped: boolean; cooldownMs: number } {
    const entry = this.getOrCreate(host);
    entry.consecutiveFailures++;
    entry.lastFailureTime = Date.now();

    if (entry.state === "HALF_OPEN" || entry.consecutiveFailures >= this.failureThreshold) {
      entry.state = "OPEN";
      entry.openUntil = Date.now() + this.cooldownMs;
      return { tripped: true, cooldownMs: this.cooldownMs };
    }

    return { tripped: false, cooldownMs: 0 };
  }

  public getStatus(host: string): {
    state: CircuitState;
    consecutiveFailures: number;
    cooldownRemainingMs: number;
  } {
    const entry = this.getOrCreate(host);
    // Refresh state if openUntil expired
    if (entry.state === "OPEN" && Date.now() >= entry.openUntil) {
      entry.state = "HALF_OPEN";
    }

    return {
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      cooldownRemainingMs: this.getCooldownRemainingMs(host),
    };
  }

  public getAllStatuses(): Record<
    string,
    { state: CircuitState; consecutiveFailures: number; cooldownRemainingMs: number }
  > {
    const result: Record<
      string,
      { state: CircuitState; consecutiveFailures: number; cooldownRemainingMs: number }
    > = {};
    for (const [host] of this.hosts) {
      result[host] = this.getStatus(host);
    }
    return result;
  }

  public reset(host?: string): void {
    if (host) {
      this.hosts.delete(host);
    } else {
      this.hosts.clear();
    }
  }
}

export const globalCircuitBreaker = new DestinationCircuitBreaker();

