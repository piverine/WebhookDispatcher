import { config } from "../config.js";
import { signPayload } from "../lib/signature.js";
import { globalCircuitBreaker } from "../lib/circuitBreaker.js";
import { eventBus } from "../lib/events.js";
import { metrics } from "../lib/metrics.js";
import {
  JobRow,
  markFailed,
  markRetry,
  markSucceeded,
  recordAttempt,
  rescheduleRateLimited,
} from "../queue/jobs.repo.js";
import { IRateLimiter } from "../ratelimit/rateLimiter.interface.js";
import { defaultLimiter } from "../ratelimit/tokenBucket.js";
import { computeBackoffDelay } from "./backoff.js";

export interface DeliveryLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/**
 * Executes delivery of a single job.
 * Handles circuit breaker, rate-limiting, HTTP dispatch, result classification, retries, and recording.
 */
export async function deliverJob(
  job: JobRow,
  limiter: IRateLimiter = defaultLimiter,
  logger?: DeliveryLogger
): Promise<void> {
  // 1. Circuit breaker check (per destination host)
  if (globalCircuitBreaker.isOpen(job.destination_host)) {
    const cooldownMs = globalCircuitBreaker.getCooldownRemainingMs(job.destination_host);
    const nextAttemptAt = new Date(Date.now() + Math.max(cooldownMs, 1000));
    await rescheduleRateLimited(job.id, nextAttemptAt);
    metrics.incCircuitBreakerTrip();
    eventBus.emit("circuit:tripped", { host: job.destination_host, cooldownMs });
    logger?.warn(
      { jobId: job.id, host: job.destination_host, cooldownMs },
      "Circuit breaker OPEN for host, delivery fast-rescheduled"
    );
    return;
  }

  // 2. Rate limiter check (per destination host)
  const allowed = await limiter.tryTake(job.destination_host);
  if (!allowed) {
    const waitMs = await limiter.msUntilToken(job.destination_host);
    const nextAttemptAt = new Date(Date.now() + waitMs);
    // Hard rule: No attempt consumed when rate-limited. Reschedule job with new next_attempt_at.
    await rescheduleRateLimited(job.id, nextAttemptAt);
    metrics.incRateLimitThrottled();
    logger?.info(
      { jobId: job.id, host: job.destination_host, waitMs },
      "Job rate-limited by token bucket, rescheduled"
    );
    return;
  }

  const attempt = job.attempt_count + 1;
  const payloadString = JSON.stringify(job.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event-Id": job.event_id,
    "X-Webhook-Attempt": String(attempt),
  };

  if (config.webhookSigningSecret) {
    headers["X-Webhook-Signature"] = signPayload(
      payloadString,
      config.webhookSigningSecret
    );
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Delivery timeout"));
  }, config.deliveryTimeoutMs);

  let responseCode: number | null = null;
  let responseError: string | null = null;
  let retryAfterHeader: string | null = null;

  try {
    const res = await fetch(job.destination_url, {
      method: "POST",
      headers,
      body: payloadString,
      redirect: "manual", // Do not follow redirects as per spec 3.3
      signal: controller.signal,
    });

    responseCode = res.status;
    retryAfterHeader = res.headers.get("retry-after");
  } catch (err: unknown) {
    responseCode = null;
    responseError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startTime;

  // Classify delivery result according to spec 3.3:
  // 2xx -> Succeeded
  // 5xx, 429, 408, timeout, network error -> Retry (if attempts remain) else Failed
  // other 4xx, 3xx -> Failed immediately (no retry)
  const is2xx = responseCode !== null && responseCode >= 200 && responseCode < 300;
  const isRetryable =
    responseCode === null ||
    responseCode === 408 ||
    responseCode === 429 ||
    responseCode >= 500;

  if (is2xx) {
    globalCircuitBreaker.recordSuccess(job.destination_host);
    await recordAttempt(
      job.id,
      attempt,
      "success",
      responseCode,
      null,
      durationMs
    );
    await markSucceeded(job.id, attempt);
    metrics.incAttempt("success", durationMs);
    eventBus.emit("job:succeeded", {
      jobId: job.id,
      eventId: job.event_id,
      destinationUrl: job.destination_url,
      durationMs,
    });
    eventBus.emit("job:attempt", {
      jobId: job.id,
      attempt,
      status: "success",
      responseCode,
      durationMs,
      error: null,
    });
    logger?.info(
      { jobId: job.id, attempt, responseCode, durationMs },
      "Job delivered successfully"
    );
    return;
  }

  if (isRetryable) {
    globalCircuitBreaker.recordFailure(job.destination_host);

    if (attempt >= job.max_attempts) {
      const errorMsg =
        responseError || `HTTP status ${responseCode} (max attempts reached)`;
      await recordAttempt(
        job.id,
        attempt,
        "failed",
        responseCode,
        errorMsg,
        durationMs
      );
      await markFailed(job.id, attempt, errorMsg);
      metrics.incAttempt("failed", durationMs);
      eventBus.emit("job:failed", {
        jobId: job.id,
        eventId: job.event_id,
        destinationUrl: job.destination_url,
        attempts: attempt,
        error: errorMsg,
      });
      eventBus.emit("job:attempt", {
        jobId: job.id,
        attempt,
        status: "failed",
        responseCode,
        durationMs,
        error: errorMsg,
      });
      logger?.warn(
        { jobId: job.id, attempt, responseCode, durationMs, error: errorMsg },
        "Job failed permanently after exhausting all retry attempts"
      );
    } else {
      let delayMs = computeBackoffDelay(attempt, config.backoffBaseMs);
      if (responseCode === 429 && retryAfterHeader) {
        const retryAfterSeconds = Number(retryAfterHeader);
        if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
          delayMs = Math.max(delayMs, retryAfterSeconds * 1000);
        }
      }

      const nextAttemptAt = new Date(Date.now() + delayMs);
      const errorMsg = responseError || `HTTP status ${responseCode}`;

      await recordAttempt(
        job.id,
        attempt,
        "retrying",
        responseCode,
        errorMsg,
        durationMs
      );
      await markRetry(job.id, attempt, nextAttemptAt, errorMsg);
      metrics.incAttempt("retrying", durationMs);
      eventBus.emit("job:retrying", {
        jobId: job.id,
        attempt,
        nextAttemptAt: nextAttemptAt.toISOString(),
        delayMs,
        error: errorMsg,
      });
      eventBus.emit("job:attempt", {
        jobId: job.id,
        attempt,
        status: "retrying",
        responseCode,
        durationMs,
        error: errorMsg,
      });
      logger?.info(
        { jobId: job.id, attempt, responseCode, delayMs, nextAttemptAt },
        "Job scheduled for retry"
      );
    }
    return;
  }

  // Non-retryable 3xx or 4xx (e.g. 400, 401, 403, 404)
  const errorMsg =
    responseError || `Non-retryable HTTP status ${responseCode}`;
  await recordAttempt(
    job.id,
    attempt,
    "failed",
    responseCode,
    errorMsg,
    durationMs
  );
  await markFailed(job.id, attempt, errorMsg);
  metrics.incAttempt("failed", durationMs);
  eventBus.emit("job:failed", {
    jobId: job.id,
    eventId: job.event_id,
    destinationUrl: job.destination_url,
    attempts: attempt,
    error: errorMsg,
  });
  eventBus.emit("job:attempt", {
    jobId: job.id,
    attempt,
    status: "failed",
    responseCode,
    durationMs,
    error: errorMsg,
  });
  logger?.warn(
    { jobId: job.id, attempt, responseCode, durationMs, error: errorMsg },
    "Job failed permanently (non-retryable response code)"
  );
}

