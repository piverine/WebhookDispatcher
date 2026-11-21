# Distributed Webhook Dispatcher Engine

A resilient, scalable webhook dispatching system built with Node.js, TypeScript, Fastify, and PostgreSQL (Neon/Supabase). It provides immediate non-blocking ingestion (`202 Accepted`), durable queueing with PostgreSQL (`FOR UPDATE SKIP LOCKED`), automatic exponential backoff retries with jitter, per-destination host token bucket rate limiting, and full delivery attempt observability.

---

## 1. Quick Start & Live URL

Live Production URL: `https://<your-render-service>.onrender.com` *(Replace with your deployed Render service URL)*

> **Note on Free Tier Sleep:** Free-tier instances (such as Render) spin down after inactivity. The first request may experience a cold start (~30-50s), but no events or jobs are ever lost as state is persisted safely in PostgreSQL. Subsequent requests process immediately.

### Quick Start (cURL)

```bash
BASE="http://localhost:3000" # or your live Render URL

# 1. Enqueue a webhook (returns 202 immediately)
curl -i -X POST "$BASE/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE"'/mock/receiver?mode=ok",
    "eventId": "evt_quickstart_1",
    "payload": { "event": "user.signup", "userId": "usr_999" }
  }'

# 2. Check the job status and delivery attempts
curl "$BASE/api/webhooks/jobs/<jobId-from-step-1>"

# 3. Check health status
curl "$BASE/health"
```

---

## 2. API Reference

### 2.1 `POST /api/webhooks/dispatch`
Enqueues a webhook delivery job. **Does NOT make any outbound HTTP calls synchronously.**

- **Request Body:**
  ```json
  {
    "destinationUrl": "https://api.partner.com/webhook",
    "eventId": "evt_123456",
    "payload": { "event": "payment.succeeded", "amount": 4900 }
  }
  ```
- **Validation:**
  - `destinationUrl`: Valid HTTP/HTTPS URL, protected against private IP / SSRF attacks.
  - `eventId`: Unique string (1 to 128 characters).
  - `payload`: Arbitrary JSON object.
- **Responses:**
  - `202 Accepted`: `{ "status": "queued", "jobId": "..." }`
  - `202 Accepted (Duplicate)`: `{ "status": "queued", "jobId": "...", "duplicate": true }`
  - `400 Bad Request`: `{ "error": "validation_failed", "details": [...] }`
  - `413 Payload Too Large`: Payload exceeds 100 KB limit.
  - `429 Too Many Requests`: Ingestion rate limit exceeded (100 req/min per IP).

### 2.2 `GET /api/webhooks/jobs/:jobId`
Retrieves the current state and complete delivery attempt history of a job.

- **Response `200 OK`:**
  ```json
  {
    "jobId": "b79bdc1f-f946-4123-bdd2-f3f6647d46ba",
    "eventId": "evt_123456",
    "destinationUrl": "https://api.partner.com/webhook",
    "status": "succeeded",
    "attemptCount": 1,
    "nextAttemptAt": "2026-11-21T03:54:35.796Z",
    "attempts": [
      {
        "attempt": 1,
        "status": "success",
        "responseCode": 200,
        "durationMs": 85,
        "error": null,
        "at": "2026-11-21T03:54:35.881Z"
      }
    ]
  }
  ```
- **Response `404 Not Found`:** `{ "error": "job_not_found" }`

### 2.3 `GET /api/webhooks/jobs`
List recent jobs. Supports optional query parameters:
- `?status=`: filter by `queued | processing | retrying | succeeded | failed`
- `?limit=`: number of jobs (default: 20, max: 100)

### 2.4 `GET /health`
Returns `{ "ok": true }` after verifying live PostgreSQL database connectivity (`SELECT 1`). Returns `503 Service Unavailable` if database is unreachable.

### 2.5 Mock Receiver (`POST /mock/receiver`)
A built-in test receiver simulating various downstream behaviors:
- `mode=ok` (default): Returns `200 OK`.
- `mode=fail`: Returns `500 Internal Server Error`.
- `mode=rate`: Returns `429 Too Many Requests` with `Retry-After: 3`.
- `mode=slow&delay=10000`: Pauses for 10 seconds before returning `200 OK`.
- `mode=flaky&failFirst=2`: Returns 500 for the first 2 hits of an `eventId`, then returns `200 OK`.
- `GET /mock/receiver/stats`: Returns hit counts per `eventId` and total hits.
- `POST /mock/receiver/reset`: Clears in-memory receiver hit stats.

---

## 3. Architecture & Design

### 3.1 Flow Diagram

```
 Client (Producer)
        │
        │ POST /api/webhooks/dispatch
        ▼
┌────────────────────────────────────────────────────────┐
│ Fastify API                                            │
│ 1. Validate payload with Zod                           │
│ 2. Validate URL (SSRF & protocol check)               │
│ 3. INSERT job ON CONFLICT (event_id) DO NOTHING        │
│ 4. Reply 202 Accepted (instant, non-blocking)          │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ PostgreSQL (Neon / Supabase / Local)                   │
│ - jobs table (status: queued, processing, retrying,   │
│               succeeded, failed)                       │
│ - delivery_attempts table (audit trail)                │
└───────────────────────▲────────────────────────────────┘
                        │
                        │ Claim due jobs: FOR UPDATE SKIP LOCKED
                        │ (locked_until = now() + 30s)
┌───────────────────────┴────────────────────────────────┐
│ Worker Poll Loop (every 500ms, max 5 concurrent)       │
│                                                        │
│ For each claimed job:                                  │
│   ├── Token bucket check (per destination host)       │
│   │     └── If limited: reschedule, 0 attempts used   │
│   ├── Dispatch POST destinationUrl (5s timeout)        │
│   │     ├── Headers: X-Webhook-Event-Id, Attempt, HMAC │
│   │     └── redirect: "manual" (no redirects)          │
│   ├── Record delivery attempt row                      │
│   └── Update job status:                               │
│         ├── 2xx ───────────► Succeeded                 │
│         ├── 429/5xx/timeout ► Retry with Backoff / Fail │
│         └── Other 4xx/3xx ─► Failed (no retry)         │
└────────────────────────────────────────────────────────┘
```

### 3.2 Core Architectural Principles

1. **Non-Blocking Ingestion:**
   The HTTP endpoint `POST /api/webhooks/dispatch` never performs outbound network requests. It validates schemas, saves the job to Postgres in a single parameterized query, and immediately returns `202 Accepted` in < 15ms.

2. **Durable Database Queue (`FOR UPDATE SKIP LOCKED`):**
   No Redis dependency. PostgreSQL serves as the persistent queue. Workers claim batch jobs using:
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
   Multiple worker processes or threads can poll concurrently without lock contention or race conditions.

3. **Crash Recovery & Deadlocks:**
   When a worker claims a job, it sets `locked_until = now() + interval '30 seconds'`. If a worker process abruptly crashes or dies mid-delivery, the job's lock expires automatically. The next poll tick re-claims the job seamlessly.

4. **Retry Semantics & Exponential Backoff:**
   - **Meaning of "3 retries":** 1 initial attempt + 3 retries = **4 attempts maximum**.
   - **Delays:** `2000ms * 2^(attempt - 1) + jitter(0-250ms)`.
     - After Attempt 1 fails: wait ~2s before Attempt 2.
     - After Attempt 2 fails: wait ~4s before Attempt 3.
     - After Attempt 3 fails: wait ~8s before Attempt 4.
     - If Attempt 4 fails: transition permanently to `failed`.
   - **HTTP 429 `Retry-After`:** If downstream responds with 429 and a `Retry-After: N` header, the delay is set to `max(exponentialBackoff, RetryAfter * 1000)`.
   - **Non-retryable errors:** 4xx client errors (e.g. 400, 401, 403, 404) and 3xx redirects fail immediately on Attempt 1 without wasting retries.

5. **Rate Limiting:**
   - **Per-Destination Host Token Bucket:** Prevents flooding downstream receivers. Default: capacity = 5 tokens, refill = 2 tokens/sec. When tokens are exhausted, the job is rescheduled with a new `next_attempt_at`. **Crucially, no attempt count is consumed for rate-limited delays.**
   - **Ingestion Limiter:** `@fastify/rate-limit` enforces 100 requests/minute per client IP on the dispatch route.
   - **Worker Concurrency Cap:** Maximum 5 simultaneous outbound deliveries in flight.

6. **Idempotency & Security:**
   - **Event Deduplication:** Unique index on `event_id`. Duplicate dispatches return the existing `jobId` with `{ "duplicate": true }` without creating duplicate jobs.
   - **SSRF Protection:** `urlGuard` blocks private and local addresses (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`).
   - **Payload HMAC Signing:** If `WEBHOOK_SIGNING_SECRET` is set, requests include `X-Webhook-Signature` (HMAC SHA-256 hex digest of the raw JSON body).
   - **Request Limits:** Fastify enforces a strict 100 KB payload body limit.

---

## 4. Test Guide & cURL Examples

Replace `BASE` with `http://localhost:3000` or your live Render URL:

```bash
BASE="http://localhost:3000"
```

### 1. Happy Path Delivery
```bash
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=ok","eventId":"evt_ok_1","payload":{"event":"user.signup","userId":"usr_999"}}'
```
*Expected:* `202 Accepted` with `jobId`. Within 500ms, job status becomes `succeeded`.

### 2. Inspect Job & Attempt History
```bash
curl "$BASE/api/webhooks/jobs/<JOB_ID>"
```
*Expected:* `200 OK` showing `status: "succeeded"`, `attemptCount: 1`, and attempt entry with `responseCode: 200`.

### 3. Flaky Downstream (Fails Twice, Succeeds on 3rd Try)
```bash
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=flaky&failFirst=2","eventId":"evt_flaky_1","payload":{"a":1}}'
```
*Expected:* `202 Accepted`. Job retries with backoff delays and transitions to `succeeded` on attempt 3.

### 4. Always Failing Downstream (Exhausts Retries)
```bash
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=fail","eventId":"evt_fail_1","payload":{"a":1}}'
```
*Expected:* `202 Accepted`. Attempts occur at ~0s, ~2s, ~6s, ~14s, ending in `failed` with `attemptCount: 4`.

### 5. Slow Target Verification (Non-Blocking)
```bash
time curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=slow&delay=10000","eventId":"evt_slow_1","payload":{"a":1}}'
```
*Expected:* Returns `202 Accepted` in < 25ms, even though the target takes 10s to respond.

### 6. Validation Error
```bash
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"not-a-url"}'
```
*Expected:* `400 Bad Request` with `{ "error": "validation_failed", ... }`.

### 7. Duplicate eventId (Idempotency)
Re-run step 1 with the identical `eventId`:
```bash
curl -i -X POST $BASE/api/webhooks/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=ok","eventId":"evt_ok_1","payload":{"event":"user.signup","userId":"usr_999"}}'
```
*Expected:* `202 Accepted` returning the identical `jobId` with `"duplicate": true`.

### 8. Burst Test for Rate Limiting
```bash
for i in $(seq 1 30); do
  curl -s -X POST $BASE/api/webhooks/dispatch \
    -H 'Content-Type: application/json' \
    -d '{"destinationUrl":"'$BASE'/mock/receiver?mode=ok","eventId":"evt_burst_'$i'","payload":{"n":'$i'}}' > /dev/null
done
curl "$BASE/mock/receiver/stats"
```
*Expected:* All 30 jobs are enqueued instantly and delivered over time at the token bucket refill rate without dropping any events.

---

## 5. Architectural Trade-offs & Next Steps

- **PostgreSQL Queue vs. Redis/BullMQ/Kafka:**
  - *Trade-off:* PostgreSQL `SKIP LOCKED` avoids introducing another stateful service (Redis/Kafka) and guarantees strong ACID persistence out of the box. For tens to hundreds of deliveries per second, Postgres is exceptionally reliable and simple.
  - *Next step:* For volumes exceeding 5,000+ dispatches/second, migrate the queue layer to Redis (BullMQ) or distributed logs (Kafka/SQS) with Postgres purely for archival.

- **In-Memory Token Bucket vs. Distributed Redis Limiter:**
  - *Trade-off:* In-memory rate limiting has zero network overhead and no external dependencies, perfect for a single dispatch node.
  - *Next step:* For multi-instance horizontal scaling, use a distributed Redis token bucket or route destination hosts consistently to specific worker partitions.

- **Delivery Guarantee (At-Least-Once):**
  - Webhooks guarantee *at-least-once* delivery. If a worker process dies after the HTTP call finishes but before Postgres records the attempt, the recovery loop will re-dispatch the job. The `X-Webhook-Event-Id` header allows downstream consumers to deduplicate.

- **Polling vs. LISTEN/NOTIFY:**
  - Polling every 500ms is straightforward, robust, and handles backoff scheduling naturally (`WHERE next_attempt_at <= now()`). Postgres `LISTEN/NOTIFY` could be added to achieve sub-millisecond initial dispatch latency.

- **Known Limitations:**
  - *DNS Resolution SSRF:* The current SSRF guard checks the literal hostname and IP. It does not perform pre-flight DNS lookups (DNS rebinding protection). In a multi-tenant enterprise setup, a custom DNS resolver or egress proxy should be used.
  - *Token Bucket State on Restart:* In-memory tokens reset on process restarts; however, pending jobs remain safely preserved in Postgres.

---

## 6. Running Locally

### Prerequisites
- Node.js >= 20
- PostgreSQL database (Local or Neon)

### Installation & Environment
1. Clone the repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd WebhookDispatcher
   npm install
   ```

2. Configure environment variables in `.env`:
   ```bash
   cp .env.example .env
   # Update DATABASE_URL with your Neon or local connection string:
   # DATABASE_URL=postgresql://user:password@localhost:5432/webhook_dispatcher
   # ALLOW_PRIVATE_DESTINATIONS=true (for localhost testing)
   ```

3. Run migrations and start the development server:
   ```bash
   npm run dev
   ```

4. Run all automated Vitest test suites:
   ```bash
   npm test
   ```

5. Build for production:
   ```bash
   npm run build
   npm start
   ```
