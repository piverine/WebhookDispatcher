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

export interface BatchEnqueueResult {
  total: number;
  accepted: number;
  duplicates: number;
  jobs: Array<{
    eventId: string;
    jobId: string;
    status: string;
    duplicate: boolean;
  }>;
}

/**
 * Atomically enqueues a batch of jobs in a single multi-row INSERT statement.
 */
export async function enqueueBatch(inputs: EnqueueInput[]): Promise<BatchEnqueueResult> {
  if (inputs.length === 0) {
    return { total: 0, accepted: 0, duplicates: 0, jobs: [] };
  }

  const valueClauses: string[] = [];
  const params: unknown[] = [];

  inputs.forEach((input, i) => {
    const offset = i * 5;
    valueClauses.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
    );
    params.push(
      input.eventId,
      input.destinationUrl,
      input.destinationHost,
      JSON.stringify(input.payload),
      input.maxAttempts ?? 4
    );
  });

  const insertSql = `
    INSERT INTO jobs (event_id, destination_url, destination_host, payload, max_attempts)
    VALUES ${valueClauses.join(", ")}
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id, event_id;
  `;

  const inserted = await pool.query<{ id: string; event_id: string }>(insertSql, params);
  const insertedMap = new Map(inserted.rows.map((r) => [r.event_id, r.id]));

  const missingEventIds = inputs
    .map((input) => input.eventId)
    .filter((eid) => !insertedMap.has(eid));

  if (missingEventIds.length > 0) {
    const existing = await pool.query<{ id: string; event_id: string }>(
      `SELECT id, event_id FROM jobs WHERE event_id = ANY($1::text[])`,
      [missingEventIds]
    );
    for (const row of existing.rows) {
      insertedMap.set(row.event_id, row.id);
    }
  }

  const jobs = inputs.map((input) => {
    const isNew = inserted.rows.some((r) => r.event_id === input.eventId);
    return {
      eventId: input.eventId,
      jobId: insertedMap.get(input.eventId) || "",
      status: "queued",
      duplicate: !isNew,
    };
  });

  const accepted = inserted.rows.length;
  const duplicates = inputs.length - accepted;

  return {
    total: inputs.length,
    accepted,
    duplicates,
    jobs,
  };
}

/**
 * List dead-letter jobs (permanently failed) with pagination and search.
 */
export async function listDlqJobs(options: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ jobs: JobRow[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  if (options.search) {
    const searchPattern = `%${options.search}%`;
    const countRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM jobs WHERE status = 'failed' AND (event_id ILIKE $1 OR destination_host ILIKE $1)`,
      [searchPattern]
    );
    const dataRes = await pool.query<JobRow>(
      `SELECT * FROM jobs WHERE status = 'failed' AND (event_id ILIKE $1 OR destination_host ILIKE $1) ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
      [searchPattern, limit, offset]
    );
    return { jobs: dataRes.rows, total: Number(countRes.rows[0]?.count || 0) };
  }

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM jobs WHERE status = 'failed'`
  );
  const dataRes = await pool.query<JobRow>(
    `SELECT * FROM jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { jobs: dataRes.rows, total: Number(countRes.rows[0]?.count || 0) };
}

/**
 * Redrives a single dead-letter job by resetting its status to queued and attempts to 0.
 */
export async function replayDlqJob(jobId: string): Promise<JobRow | null> {
  const sql = `
    UPDATE jobs
    SET status = 'queued',
        attempt_count = 0,
        next_attempt_at = now(),
        locked_until = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = $1 AND status = 'failed'
    RETURNING *;
  `;
  const res = await pool.query<JobRow>(sql, [jobId]);
  return res.rows[0] || null;
}

/**
 * Redrives all dead-letter jobs in batch back to queued.
 */
export async function replayAllDlq(limit = 100): Promise<number> {
  const sql = `
    WITH to_replay AS (
      SELECT id FROM jobs
      WHERE status = 'failed'
      ORDER BY updated_at ASC
      LIMIT $1
    )
    UPDATE jobs j
    SET status = 'queued',
        attempt_count = 0,
        next_attempt_at = now(),
        locked_until = NULL,
        last_error = NULL,
        updated_at = now()
    FROM to_replay
    WHERE j.id = to_replay.id
    RETURNING j.id;
  `;
  const res = await pool.query(sql, [limit]);
  return res.rowCount || 0;
}

/**
 * Returns count of jobs grouped by status for metrics and dashboard.
 */
export async function getQueueStats(): Promise<Record<string, number>> {
  const res = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text as count FROM jobs GROUP BY status;`
  );
  const stats: Record<string, number> = {
    queued: 0,
    processing: 0,
    retrying: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const row of res.rows) {
    stats[row.status] = Number(row.count) || 0;
  }
  return stats;
}


