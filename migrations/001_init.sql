CREATE TABLE IF NOT EXISTS jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         TEXT NOT NULL UNIQUE,
  destination_url  TEXT NOT NULL,
  destination_host TEXT NOT NULL,
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'queued',
    -- queued | processing | retrying | succeeded | failed
  attempt_count    INT  NOT NULL DEFAULT 0,
  max_attempts     INT  NOT NULL DEFAULT 4,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until     TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs (next_attempt_at)
  WHERE status IN ('queued', 'retrying', 'processing');

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id            BIGSERIAL PRIMARY KEY,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt       INT  NOT NULL,
  status        TEXT NOT NULL,  -- success | failed | retrying | rate_limited
  response_code INT,
  error         TEXT,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attempts_job_idx ON delivery_attempts (job_id);

