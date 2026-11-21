import { pool } from "../db.js";

export interface JobRow {
  id: string;
  event_id: string;
  destination_url: string;
  destination_host: string;
  payload: Record<string, unknown>;
  status: "queued" | "processing" | "retrying" | "succeeded" | "failed";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date;
  locked_until: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeliveryAttemptRow {
  id: string;
  job_id: string;
  attempt: number;
  status: "success" | "failed" | "retrying" | "rate_limited";
  response_code: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: Date;
}

export interface EnqueueInput {
  eventId: string;
  destinationUrl: string;
  destinationHost: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}

export interface EnqueueResult {
  job: JobRow;
  duplicate: boolean;
}

/**
 * Enqueue a job idempotently. If event_id already exists, return the existing row.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  const insertSql = `
    INSERT INTO jobs (event_id, destination_url, destination_host, payload, max_attempts)
    VALUES ($1, $2, $3, $4, COALESCE($5, 4))
    ON CONFLICT (event_id) DO NOTHING
    RETURNING *;
  `;

  const res = await pool.query<JobRow>(insertSql, [
    input.eventId,
    input.destinationUrl,
    input.destinationHost,
    JSON.stringify(input.payload),
    input.maxAttempts ?? 4,
  ]);

  if (res.rows.length > 0) {
    return { job: res.rows[0], duplicate: false };
  }

  // Row already exists - retrieve it
  const selectSql = `SELECT * FROM jobs WHERE event_id = $1 LIMIT 1;`;
  const existingRes = await pool.query<JobRow>(selectSql, [input.eventId]);
  return { job: existingRes.rows[0], duplicate: true };
}

/**
 * Claim due jobs using FOR UPDATE SKIP LOCKED.
 * Also recovers jobs stuck in 'processing' whose locked_until has expired.
 */
export async function claimDueJobs(limit: number): Promise<JobRow[]> {
  const sql = `
    WITH due AS (
      SELECT id FROM jobs
      WHERE (status IN ('queued', 'retrying') AND next_attempt_at <= now())
         OR (status = 'processing' AND locked_until < now())
      ORDER BY next_attempt_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs j
    SET status = 'processing',
        locked_until = now() + interval '30 seconds',
        updated_at = now()
    FROM due
    WHERE j.id = due.id
    RETURNING j.*;
  `;

  const res = await pool.query<JobRow>(sql, [limit]);
  return res.rows;
}

/**
 * Reschedule job due to rate limiting (no attempt counted, no failure logged).
 */
export async function rescheduleRateLimited(jobId: string, nextAttemptAt: Date): Promise<void> {
  const sql = `
    UPDATE jobs
    SET status = 'retrying',
        next_attempt_at = $2,
        locked_until = NULL,
        updated_at = now()
    WHERE id = $1;
  `;
  await pool.query(sql, [jobId, nextAttemptAt]);
}

/**
 * Mark a job as succeeded.
 */
export async function markSucceeded(jobId: string, attemptCount: number): Promise<void> {
  const sql = `
    UPDATE jobs
    SET status = 'succeeded',
        attempt_count = $2,
        locked_until = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = $1;
  `;
  await pool.query(sql, [jobId, attemptCount]);
}

/**
 * Mark a job for retry after backoff delay.
 */
export async function markRetry(
  jobId: string,
  attemptCount: number,
  nextAttemptAt: Date,
  lastError: string | null
): Promise<void> {
  const sql = `
    UPDATE jobs
    SET status = 'retrying',
        attempt_count = $2,
        next_attempt_at = $3,
        locked_until = NULL,
        last_error = $4,
        updated_at = now()
    WHERE id = $1;
  `;
  await pool.query(sql, [jobId, attemptCount, nextAttemptAt, lastError]);
}

/**
 * Mark a job as permanently failed after exhausting attempts or non-retryable 4xx.
 */
export async function markFailed(
  jobId: string,
  attemptCount: number,
  lastError: string | null
): Promise<void> {
  const sql = `
    UPDATE jobs
    SET status = 'failed',
        attempt_count = $2,
        locked_until = NULL,
        last_error = $4,
        updated_at = now()
    WHERE id = $1;
  `;
  // Using $1, $2, $3 (lastError)
  await pool.query(
    `
    UPDATE jobs
    SET status = 'failed',
        attempt_count = $2,
        locked_until = NULL,
        last_error = $3,
        updated_at = now()
    WHERE id = $1;
  `,
    [jobId, attemptCount, lastError]
  );
}

/**
 * Record a single delivery attempt.
 */
export async function recordAttempt(
  jobId: string,
  attempt: number,
  status: "success" | "failed" | "retrying" | "rate_limited",
  responseCode: number | null,
  error: string | null,
  durationMs: number | null
): Promise<DeliveryAttemptRow> {
  const sql = `
    INSERT INTO delivery_attempts (job_id, attempt, status, response_code, error, duration_ms)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const res = await pool.query<DeliveryAttemptRow>(sql, [
    jobId,
    attempt,
    status,
    responseCode,
    error,
    durationMs,
  ]);
  return res.rows[0];
}

/**
 * Fetch a job and its delivery attempts by job ID.
 */
export async function getJobWithAttempts(jobId: string): Promise<{
  job: JobRow;
  attempts: DeliveryAttemptRow[];
} | null> {
  const jobRes = await pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [jobId]);
  if (jobRes.rows.length === 0) {
    return null;
  }

  const attemptsRes = await pool.query<DeliveryAttemptRow>(
    "SELECT * FROM delivery_attempts WHERE job_id = $1 ORDER BY attempt ASC",
    [jobId]
  );

  return {
    job: jobRes.rows[0],
    attempts: attemptsRes.rows,
  };
}

/**
 * List recent jobs with optional status filter and limit.
 */
export async function listJobs(options: { status?: string; limit?: number }): Promise<JobRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  if (options.status) {
    const res = await pool.query<JobRow>(
      "SELECT * FROM jobs WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
      [options.status, limit]
    );
    return res.rows;
  }
  const res = await pool.query<JobRow>(
    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return res.rows;
}

