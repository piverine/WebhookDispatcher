import { pool } from "../db.js";

class MetricsCollector {
  private enqueuedTotal = 0;
  private batchEnqueuedTotal = 0;
  private attempts = {
    success: 0,
    failed: 0,
    retrying: 0,
    rate_limited: 0,
  };
  private totalDurationMs = 0;
  private durationCount = 0;
  private circuitBreakerTrips = 0;
  private rateLimitThrottled = 0;
  private dlqRedrives = 0;

  public incEnqueued(count = 1, isBatch = false): void {
    this.enqueuedTotal += count;
    if (isBatch) {
      this.batchEnqueuedTotal += count;
    }
  }

  public incAttempt(status: "success" | "failed" | "retrying" | "rate_limited", durationMs?: number | null): void {
    if (this.attempts[status] !== undefined) {
      this.attempts[status]++;
    }
    if (typeof durationMs === "number" && durationMs >= 0) {
      this.totalDurationMs += durationMs;
      this.durationCount++;
    }
  }

  public incCircuitBreakerTrip(): void {
    this.circuitBreakerTrips++;
  }

  public incRateLimitThrottled(): void {
    this.rateLimitThrottled++;
  }

  public incDlqRedrive(count = 1): void {
    this.dlqRedrives += count;
  }

  /**
   * Generates Prometheus / OpenMetrics text exposition format.
   */
  public async getPrometheusText(): Promise<string> {
    // Query live queue depth directly from PostgreSQL
    let queueDepths: Record<string, number> = {
      queued: 0,
      processing: 0,
      retrying: 0,
      succeeded: 0,
      failed: 0,
    };

    try {
      const res = await pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text as count FROM jobs GROUP BY status;`
      );
      for (const row of res.rows) {
        queueDepths[row.status] = Number(row.count) || 0;
      }
    } catch {
      // If DB error, preserve defaults
    }

    const avgDurationSeconds =
      this.durationCount > 0 ? (this.totalDurationMs / this.durationCount / 1000).toFixed(4) : "0.0000";

    const lines: string[] = [
      "# HELP webhook_jobs_enqueued_total Total number of webhook jobs accepted into queue",
      "# TYPE webhook_jobs_enqueued_total counter",
      `webhook_jobs_enqueued_total ${this.enqueuedTotal}`,
      "",
      "# HELP webhook_jobs_batch_enqueued_total Total number of webhook jobs enqueued via batch API",
      "# TYPE webhook_jobs_batch_enqueued_total counter",
      `webhook_jobs_batch_enqueued_total ${this.batchEnqueuedTotal}`,
      "",
      "# HELP webhook_delivery_attempts_total Total delivery attempts by execution outcome",
      "# TYPE webhook_delivery_attempts_total counter",
      `webhook_delivery_attempts_total{status="success"} ${this.attempts.success}`,
      `webhook_delivery_attempts_total{status="failed"} ${this.attempts.failed}`,
      `webhook_delivery_attempts_total{status="retrying"} ${this.attempts.retrying}`,
      `webhook_delivery_attempts_total{status="rate_limited"} ${this.attempts.rate_limited}`,
      "",
      "# HELP webhook_delivery_duration_seconds_avg Average delivery latency in seconds",
      "# TYPE webhook_delivery_duration_seconds_avg gauge",
      `webhook_delivery_duration_seconds_avg ${avgDurationSeconds}`,
      "",
      "# HELP webhook_delivery_duration_seconds_sum Sum of all delivery latencies in seconds",
      "# TYPE webhook_delivery_duration_seconds_sum counter",
      `webhook_delivery_duration_seconds_sum ${(this.totalDurationMs / 1000).toFixed(4)}`,
      "",
      "# HELP webhook_delivery_duration_seconds_count Total count of timed delivery attempts",
      "# TYPE webhook_delivery_duration_seconds_count counter",
      `webhook_delivery_duration_seconds_count ${this.durationCount}`,
      "",
      "# HELP webhook_queue_depth Current jobs by status in PostgreSQL queue",
      "# TYPE webhook_queue_depth gauge",
      `webhook_queue_depth{status="queued"} ${queueDepths.queued}`,
      `webhook_queue_depth{status="processing"} ${queueDepths.processing}`,
      `webhook_queue_depth{status="retrying"} ${queueDepths.retrying}`,
      `webhook_queue_depth{status="succeeded"} ${queueDepths.succeeded}`,
      `webhook_queue_depth{status="failed"} ${queueDepths.failed}`,
      "",
      "# HELP webhook_circuit_breaker_trips_total Total times destination circuit breaker tripped OPEN",
      "# TYPE webhook_circuit_breaker_trips_total counter",
      `webhook_circuit_breaker_trips_total ${this.circuitBreakerTrips}`,
      "",
      "# HELP webhook_rate_limit_throttled_total Total jobs deferred due to per-host rate limit",
      "# TYPE webhook_rate_limit_throttled_total counter",
      `webhook_rate_limit_throttled_total ${this.rateLimitThrottled}`,
      "",
      "# HELP webhook_dlq_redrives_total Total dead-letter jobs redriven back to queued",
      "# TYPE webhook_dlq_redrives_total counter",
      `webhook_dlq_redrives_total ${this.dlqRedrives}`,
      "",
    ];

    return lines.join("\n");
  }
}

export const metrics = new MetricsCollector();

