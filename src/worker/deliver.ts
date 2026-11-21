import { config } from "../config.js";
import { signPayload } from "../lib/signature.js";
import {
  JobRow,
  markFailed,
  markRetry,
  markSucceeded,
  recordAttempt,
  rescheduleRateLimited,
} from "../queue/jobs.repo.js";
import { defaultLimiter, TokenBucketLimiter } from "../ratelimit/tokenBucket.js";
import { computeBackoffDelay } from "./backoff.js";

export interface DeliveryLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/**
 * Executes delivery of a single job.
 * Handles rate-limiting, HTTP dispatch, result classification, retries, and recording.
 */
export async function deliverJob(
  job: JobRow,
  limiter: TokenBucketLimiter = defaultLimiter,
  logger?: DeliveryLogger
): Promise<void> {
  // 1. Rate limiter check (per destination host)
  if (!limiter.tryTake(job.destination_host)) {
    const waitMs = limiter.msUntilToken(job.destination_host);
    const nextAttemptAt = new Date(Date.now() + waitMs);
    // Hard rule: No attempt consumed when rate-limited. Reschedule job with new next_attempt_at.
    await rescheduleRateLimited(job.id, nextAttemptAt);
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
    await recordAttempt(
      job.id,
      attempt,
      "success",
      responseCode,
      null,
      durationMs
    );
    await markSucceeded(job.id, attempt);
    logger?.info(
      { jobId: job.id, attempt, responseCode, durationMs },
      "Job delivered successfully"
    );
    return;
  }

  if (isRetryable) {
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
  logger?.warn(
    { jobId: job.id, attempt, responseCode, durationMs, error: errorMsg },
    "Job failed permanently (non-retryable response code)"
  );
}

