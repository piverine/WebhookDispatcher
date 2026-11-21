# WEBHOOK DISPATCHER: AGENT SPEC

> Audience: an AI coding agent (Antigravity). Read this whole file before writing code.
> Follow the decisions here. Do not change the stack unless blocked. If blocked, pick the simplest alternative and record the reason in README under "Trade-offs".

---

## 0. TASK SUMMARY

Build a **Distributed Webhook Dispatcher Engine** (backend intern take-home, 48h limit).

Deliverables:
1. A live public API on a free-tier host (Render).
2. A GitHub repo with source code and a `README.md` containing curl tests and a short architecture section.

The system must:
- Accept events at `POST /api/webhooks/dispatch`, validate, save as a job, return `202 Accepted` immediately.
- Deliver each job in the background via `POST` to `destinationUrl`.
- Retry on 5xx, 429, or timeout, up to 3 retries, with exponential backoff (2s, 4s, 8s).
- Log every delivery attempt (status, response code, attempt number).
- Rate limit so one destination host is never flooded.

Graders will: hit the live URL, check ingestion is instant (even if target takes 10s), check background delivery completes, and discuss architecture in a live interview.

---

## 1. HARD RULES (never break)

1. `POST /api/webhooks/dispatch` must NOT make any outbound HTTP call. It only validates, inserts, and replies.
2. All SQL lives in `src/queue/jobs.repo.ts`. Use parameterized queries only.
3. One failing job must never crash the worker loop. Wrap each delivery in try/catch.
4. Never commit secrets. Only `.env.example` goes in git.
5. Code must be simple and readable. The author must be able to explain every line in an interview.
6. Add short comments on non-obvious logic: claim query, backoff, token bucket, crash recovery.
7. After each phase, run its CHECK and report the result before moving on.
8. Commit after each phase with a clear message.

---

## 2. STACK (fixed)

| Part | Choice |
|---|---|
| Runtime | Node.js 20, TypeScript |
| HTTP | Fastify |
| DB | PostgreSQL (Neon or Supabase free tier), `pg` driver |
| Queue | Postgres table + `FOR UPDATE SKIP LOCKED` (no Redis) |
| Worker | Poll loop in the same process |
| Rate limiter | In-memory token bucket per destination host |
| Validation | Zod |
| HTTP client | Native `fetch` + `AbortController` |
| Logging | pino (built into Fastify) |
| Ingestion limiter | `@fastify/rate-limit` |
| Tests | Vitest |
| Host | Render free web service |

**Retry meaning:** "3 retries" = 1 first try + 3 retries = **4 attempts max**. Delays before retries 1, 2, 3 = 2s, 4s, 8s. State this in README.

---

## 3. ARCHITECTURE

### 3.1 Flow

```
Client
  |  POST /api/webhooks/dispatch
  v
[API] validate -> INSERT job (status=queued) -> 202 {status, jobId}
                         |
                         v
                  [Postgres: jobs, delivery_attempts]
                         ^
                         | claim due jobs (SKIP LOCKED)
                         |
[Worker loop every 500ms, max 5 concurrent]
  -> token bucket check (per host)
  -> fetch POST destinationUrl (5s timeout)
  -> record attempt row
  -> update job: succeeded | retrying | failed
```

### 3.2 Job states

```
queued -> processing -> succeeded
                     -> retrying -> processing -> ...
                     -> failed
```

### 3.3 Delivery result rules

| Result | Action |
|---|---|
| 2xx | job = `succeeded` |
| 5xx, 429, 408, timeout, network error | retry if attempts left, else `failed` |
| other 4xx, 3xx | job = `failed` immediately (no retry) |

- Backoff delay = `2000ms * 2^(attempt-1)` plus 0 to 250ms jitter.
- On 429 with `Retry-After`: delay = `max(backoff, Retry-After)`.
- Do not follow redirects (`redirect: "manual"`).

### 3.4 Crash recovery

On claim, set `locked_until = now() + 30s`. The claim query also picks jobs with `status='processing' AND locked_until < now()`. So a job claimed by a dead process gets retried.

### 3.5 Rate limiting

1. **Per-destination token bucket** (core requirement)
   - Key = hostname of `destinationUrl`.
   - Defaults: capacity 5, refill 2 tokens/sec.
   - No token available: do NOT send, do NOT consume an attempt. Set `next_attempt_at = now + msUntilToken`, status back to `retrying` (or `queued`), and move on.
2. **Ingestion limiter**: 100 requests/min per IP on the dispatch route.
3. **Worker concurrency cap**: 5 in-flight deliveries.

### 3.6 Idempotency

`event_id` has a UNIQUE index. Duplicate `eventId` returns the existing job: `202 {status:"queued", jobId:<existing>, duplicate:true}`. No second job.

### 3.7 Safety

- Allow only `http` and `https`.
- Block private and local hosts: `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`. Skip this check when `ALLOW_PRIVATE_DESTINATIONS=true`.
- Request body limit: 100 KB.
- Optional: if `WEBHOOK_SIGNING_SECRET` is set, add `X-Webhook-Signature` (HMAC SHA-256 of body).
- Always send `X-Webhook-Event-Id` and `X-Webhook-Attempt` headers.

---

## 4. API SPEC

### 4.1 `POST /api/webhooks/dispatch`

Request:
```json
{
  "destinationUrl": "https://target-server.com/endpoint",
  "eventId": "evt_123456",
  "payload": { "event": "user.signup", "userId": "usr_999" }
}
```

Validation:
- `destinationUrl`: required, valid http(s) URL, passes SSRF guard.
- `eventId`: required string, 1 to 128 chars.
- `payload`: required JSON object.

Responses:
- `202` `{ "status": "queued", "jobId": "<uuid>" }`
- `202` duplicate: `{ "status": "queued", "jobId": "<existing>", "duplicate": true }`
- `400` `{ "error": "validation_failed", "details": [...] }`
- `429` ingestion rate limit hit

### 4.2 `GET /api/webhooks/jobs/:jobId`

```json
{
  "jobId": "...",
  "eventId": "evt_123456",
  "destinationUrl": "...",
  "status": "retrying",
  "attemptCount": 2,
  "nextAttemptAt": "2026-11-21T10:00:04.000Z",
  "attempts": [
    { "attempt": 1, "status": "failed", "responseCode": 503, "durationMs": 120, "error": null, "at": "..." }
  ]
}
```
`404` if not found.

### 4.3 `GET /api/webhooks/jobs` (optional)
Query: `?status=`, `?limit=` (max 100). Returns recent jobs.

### 4.4 `GET /health`
Returns `{ "ok": true }` after a quick DB check.

### 4.5 Mock receiver `POST /mock/receiver`

Fake downstream for demos and tests. Controlled by query params:

| Query | Behavior |
|---|---|
| `mode=ok` (default) | return 200 |
| `mode=fail` | return 500 |
| `mode=rate` | return 429 with `Retry-After: 3` |
| `mode=slow&delay=10000` | wait 10s, then 200 |
| `mode=flaky&failFirst=2` | fail first N hits per `eventId`, then 200 |

Keep in-memory counters per `eventId`. Add `GET /mock/receiver/stats` returning hit counts.

---

## 5. DATA MODEL

File: `migrations/001_init.sql`. Run on boot (idempotent, use `IF NOT EXISTS`).

```sql
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
```

Claim query (core of the queue):

```sql
WITH due AS (
  SELECT id FROM jobs
  WHERE (status IN ('queued','retrying') AND next_attempt_at <= now())
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
```

---

## 6. WORKER PSEUDOCODE

```
loop every POLL_INTERVAL_MS:
  if tickRunning: continue          # no overlapping ticks
  free = WORKER_CONCURRENCY - inFlight
  if free <= 0: continue
  jobs = claim(free)
  for job in jobs: run deliver(job) in parallel (do not await all)

deliver(job):
  try:
    if !limiter.tryTake(job.destination_host):
      reschedule(job, now + limiter.msUntilToken(host))   # no attempt used
      return
    attempt = job.attempt_count + 1
    start = now
    try:
      res = fetch POST job.destination_url, timeout DELIVERY_TIMEOUT_MS, headers + JSON payload
      code = res.status
    catch e:
      code = null; error = e.message
    recordAttempt(job.id, attempt, code, error, duration)
    if 200 <= code < 300: markSucceeded(job)
    elif code is null or code in (408, 429) or code >= 500:
      if attempt >= job.max_attempts: markFailed(job)
      else:
        delay = BACKOFF_BASE_MS * 2^(attempt-1) + jitter
        if code == 429 and Retry-After: delay = max(delay, RetryAfter)
        markRetry(job, now + delay)
    else: markFailed(job)
  catch unexpected: log error; markRetry or release job so it is not stuck
```

Also implement:
- Graceful shutdown on `SIGTERM`: stop claiming, wait up to ~10s for in-flight jobs, close DB pool.
- Structured JSON logs for every attempt.

---

## 7. FILE STRUCTURE

```
webhook-dispatcher/
├── src/
│   ├── server.ts            # boot: config, db, api, worker
│   ├── config.ts            # env parsing with defaults
│   ├── db.ts                # pg Pool + run migration
│   ├── routes/
│   │   ├── dispatch.ts
│   │   ├── jobs.ts
│   │   ├── health.ts
│   │   └── mock.ts
│   ├── queue/
│   │   └── jobs.repo.ts     # enqueue, claim, markSucceeded, markRetry, markFailed, recordAttempt, getJob
│   ├── worker/
│   │   ├── worker.ts        # poll loop
│   │   ├── deliver.ts       # HTTP send + result handling
│   │   └── backoff.ts
│   ├── ratelimit/
│   │   └── tokenBucket.ts
│   └── lib/
│       ├── urlGuard.ts
│       └── signature.ts
├── migrations/001_init.sql
├── tests/
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 8. ENV VARS

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `DATABASE_URL` | required | Postgres connection string |
| `WORKER_CONCURRENCY` | 5 | Parallel deliveries |
| `POLL_INTERVAL_MS` | 500 | Queue poll rate |
| `DELIVERY_TIMEOUT_MS` | 5000 | Per-request timeout |
| `MAX_ATTEMPTS` | 4 | 1 try + 3 retries |
| `BACKOFF_BASE_MS` | 2000 | 2s, 4s, 8s |
| `RATE_BUCKET_CAPACITY` | 5 | Tokens per host |
| `RATE_REFILL_PER_SEC` | 2 | Refill speed |
| `INGEST_RATE_LIMIT_PER_MIN` | 100 | Per-IP limit on dispatch |
| `ALLOW_PRIVATE_DESTINATIONS` | false | Allow localhost targets |
| `WEBHOOK_SIGNING_SECRET` | empty | Enables HMAC header |

---

## 9. IMPLEMENTATION PLAN

Do phases in order. Each phase has a CHECK. Do not continue until it passes.

### Phase 0: Setup
- [ ] Init repo, TypeScript, install `fastify`, `pg`, `zod`, `vitest`, `@fastify/rate-limit`, `tsx`.
- [ ] Create `.env.example`, `.gitignore` (`.env`, `node_modules`, `dist`).
- [ ] Add scripts: `dev`, `build`, `start`, `test`.
- CHECK: `GET /health` returns ok locally.

### Phase 1: Database and ingestion
- [ ] Write `migrations/001_init.sql`, run on boot.
- [ ] `jobs.repo.ts`: `enqueue()` using `INSERT ... ON CONFLICT (event_id) DO NOTHING`, then select the existing row if nothing inserted.
- [ ] `POST /api/webhooks/dispatch` with Zod and URL guard.
- [ ] `GET /api/webhooks/jobs/:jobId`.
- CHECK: dispatch returns `202` fast and row exists. Bad body returns `400`. Duplicate `eventId` returns same `jobId`.

### Phase 2: Worker and delivery
- [ ] `claim()` with `SKIP LOCKED` and stale lock recovery.
- [ ] `deliver.ts` with timeout, result classification, attempt logging.
- [ ] Start worker loop from `server.ts`.
- [ ] Build mock receiver with `mode=ok` and `mode=fail`.
- CHECK: job goes `queued` to `succeeded`, one attempt row exists.

### Phase 3: Retry and backoff
- [ ] `backoff.ts` (2s, 4s, 8s plus jitter).
- [ ] Retry decision, `Retry-After` on 429, `failed` after last attempt, immediate fail on non-retryable 4xx.
- [ ] Add `mode=flaky` and `mode=rate` to the mock.
- CHECK: `mode=fail` gives 4 attempts at about 0s, 2s, 6s, 14s, then `failed`. `flaky&failFirst=2` ends `succeeded` on attempt 3.

### Phase 4: Rate limiting
- [ ] `tokenBucket.ts`: `tryTake(host)`, `msUntilToken(host)`.
- [ ] Integrate in `deliver()` (no attempt consumed when limited).
- [ ] Add ingestion limiter.
- [ ] Add `mode=slow` to mock.
- CHECK: 30 jobs to one host are delivered at about the refill rate, none lost. A `slow` target does not slow the dispatch response.

### Phase 5: Hardening
- [ ] Graceful shutdown, error handling around loop, body size limit, redirect handling, optional HMAC.
- [ ] Kill the process mid-delivery and confirm recovery after `locked_until`.
- CHECK: no unhandled rejections. Restart resumes pending jobs.

### Phase 6: Tests (Vitest)
- [ ] Backoff returns 2s, 4s, 8s (jitter off or bounded).
- [ ] Token bucket: burst up to capacity, then blocks, then refills.
- [ ] URL guard: blocks private IPs and non-http schemes.
- [ ] Retry classification: 2xx success, 429/5xx/timeout retry, 400/404 fail immediately.
- [ ] Integration: dispatch to mock `flaky`, poll job until `succeeded`.
- CHECK: `npm test` passes.

### Phase 7: Deploy (Render)
- [ ] Push to GitHub.
- [ ] Create Render Web Service. Build: `npm ci && npm run build`. Start: `npm start`.
- [ ] Set env vars from section 8. Health check path: `/health`.
- [ ] Use the public Render URL as the mock destination. Keep `ALLOW_PRIVATE_DESTINATIONS=false` in production.
- [ ] Run all curl tests from section 10 against the live URL.
- [ ] Note in README: free tier sleeps when idle, so the first request can be slow. Optionally use a free pinger on `/health`.
- CHECK: live dispatch returns `202` and job reaches `succeeded`.

### Phase 8: README
- [ ] Write README using section 11.

---

## 10. CURL TESTS (put in README)

`BASE=https://<your-app>.onrender.com`

```bash
# 1. Happy path
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=ok","eventId":"evt_ok_1","payload":{"event":"user.signup","userId":"usr_999"}}'

# 2. Check job (use jobId from step 1)
curl $BASE/api/webhooks/jobs/<jobId>

# 3. Retry then succeed
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=flaky&failFirst=2","eventId":"evt_flaky_1","payload":{"a":1}}'

# 4. Always failing target (ends failed after 4 attempts)
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=fail","eventId":"evt_fail_1","payload":{"a":1}}'

# 5. Slow target: dispatch must still return instantly
time curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=slow&delay=10000","eventId":"evt_slow_1","payload":{"a":1}}'

# 6. Validation error (expect 400)
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"not-a-url"}'

# 7. Duplicate eventId: run command 1 again, expect same jobId and duplicate:true

# 8. Burst for rate limiting
for i in $(seq 1 30); do
  curl -s -X POST $BASE/api/webhooks/dispatch \
    -H 'Content-Type: application/json' \
    -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=ok","eventId":"evt_burst_'$i'","payload":{"n":'$i'}}' > /dev/null
done
curl $BASE/mock/receiver/stats
```

---

## 11. README OUTLINE

1. Overview (one paragraph).
2. Live URL and quick start (3 curl commands).
3. API reference (section 4).
4. Test guide (section 10 with expected results).
5. Architecture section with a short diagram and these points:
   - Non-blocking ingestion: validate, insert, `202`.
   - Background execution: poll loop, `SKIP LOCKED`, concurrency cap.
   - State persistence: Postgres, no event lost on restart or crash.
   - Error handling: retry rules, non-retryable 4xx, timeouts, `Retry-After`.
   - Rate limiting: token bucket per host plus ingestion limiter.
   - Idempotency and SSRF protection.
6. Trade-offs and next steps (section 12).
7. Run locally: env vars, `npm run dev`, `npm test`.

---

## 12. TRADE-OFFS (for README and interview)

- **Postgres queue vs Redis/BullMQ:** simpler and durable, fine for moderate load. At high volume, move to Redis, Kafka, or SQS.
- **In-memory rate limiter:** fine for one instance. For many instances, use Redis or route by host.
- **Delivery guarantee:** at-least-once. A receiver may get a duplicate if we crash after delivery but before saving the result. `X-Webhook-Event-Id` lets receivers dedupe.
- **Polling vs LISTEN/NOTIFY:** polling is simple. LISTEN/NOTIFY would lower latency.
- **Dead letter handling:** `failed` jobs stay in the table. A replay endpoint is a next step.
- **Circuit breaker per host:** next step to stop hitting a host that is fully down.
- **Free tier sleep:** cold start delays the first request, but no data is lost since jobs live in the database.

---

## 13. IMPLEMENTATION NOTES (read before Phase 0)

These are details that commonly break builds or deploys. Follow them.

**Server and deploy**
- Listen on `host: "0.0.0.0"` and `port: Number(process.env.PORT)`. Render will not reach the app on localhost.
- Create Fastify with `trustProxy: true`. Without it, the per-IP rate limit sees the proxy IP, not the client.
- Set `"engines": { "node": ">=20" }` in `package.json`.

**TypeScript setup**
- Use ESM: `"type": "module"` in `package.json`, `module` and `moduleResolution` set to `NodeNext`.
- Local imports must end in `.js` (example: `import { config } from "./config.js"`).
- Scripts: `dev` = `tsx watch src/server.ts`, `build` = `tsc`, `start` = `node dist/server.js`, `test` = `vitest run`.

**Database**
- Neon and Supabase need SSL. Use `new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 10 })`. Skip SSL only for a local Postgres.
- Run migrations on boot by reading `migrations/*.sql` from `path.join(process.cwd(), "migrations")` in filename order. Render runs from the repo root, so this path works.
- `attempt_count` goes up by 1 only when a real HTTP call was made. A rate-limited reschedule must NOT change it.
- A rate-limited job gets `status='retrying'` and a new `next_attempt_at`. Do not write a failure to `last_error` for it.
- On boot, log the config values (never secrets) so deploy problems are easy to see.

**Testing**
- Unit tests must not need a database.
- The integration test needs `DATABASE_URL`. Skip it with a clear message if the variable is not set. Use unique `eventId` values (for example with a timestamp) so reruns do not collide with the UNIQUE index.
- Make backoff jitter configurable (or injectable) so tests can turn it off.

**Known limits (mention in README, do not fix)**
- The SSRF guard checks the literal hostname or IP only. It does not resolve DNS, so a domain that points to a private IP gets through. Note this as a next step.
- The token bucket resets on restart. This is fine because jobs are saved in Postgres.

**Steps only the human can do (the agent must stop and ask)**
1. Create the Postgres database (Neon or Supabase) and provide `DATABASE_URL`.
2. Create the GitHub repo and push.
3. Create the Render service and add env vars.
4. Send the live URL and repo link to the company.

**Working mode**
- Whether you build in one go or phase by phase, still follow the phase order and run each CHECK. If building in one go, report all CHECK results at the end.

---

## 14. DEFINITION OF DONE

- [ ] Live URL returns `202` in well under 1s, even for a 10s target.
- [ ] Jobs are delivered in the background and reach `succeeded`.
- [ ] Failing targets get 3 retries at 2s, 4s, 8s, then `failed`.
- [ ] Every attempt is stored (status, response code, attempt number) and visible via the jobs endpoint.
- [ ] Per-host token bucket works. Ingestion is rate limited.
- [ ] Duplicate `eventId` does not create a second job.
- [ ] Restarting the server does not lose jobs.
- [ ] Tests pass.
- [ ] README has curl tests, architecture section, and trade-offs.
- [ ] GitHub repo is public with clean commit history.
