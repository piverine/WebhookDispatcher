# Distributed Webhook Dispatcher Engine

A resilient, scalable, asynchronous webhook delivery engine built with **Node.js 20+, TypeScript, Fastify, and PostgreSQL (Neon / Supabase / Local)**. It provides non-blocking ingestion (`202 Accepted`), durable queueing via PostgreSQL (`FOR UPDATE SKIP LOCKED`), automatic exponential backoff retries with full jitter, per-destination host token bucket rate limiting (with optional distributed Redis coordination), destination circuit breaking, dead-letter queue (DLQ) redrive, Prometheus observability, real-time Server-Sent Events (SSE), and a built-in dark-mode dashboard.

---

## 🎯 Live Deployment & Deliverables (Judge's Quick Links)

| Deliverable | URL / Value |
|---|---|
| **Live Public API URL** | `https://webhookdispatcher-w948.onrender.com` *(or replace with your deployed Render service URL)* |
| **Interactive Web Dashboard** | `https://webhookdispatcher-w948.onrender.com/dashboard` *(or root `/` in any web browser)* |
| **GitHub Repository** | [https://github.com/piverine/WebhookDispatcher](https://github.com/piverine/WebhookDispatcher) |
| **Health Check Endpoint** | `https://webhookdispatcher-w948.onrender.com/health` |
| **Prometheus Metrics** | `https://webhookdispatcher-w948.onrender.com/metrics` |
| **Live Real-Time SSE Stream** | `https://webhookdispatcher-w948.onrender.com/api/webhooks/stream` |

> **Note on Free-Tier Hosting (Render Cold Starts):** Free-tier instances spin down after inactivity. The first request after an idle period may take 30–50 seconds while the container initializes. Subsequent requests respond in < 15ms. Because all state is durably persisted in PostgreSQL, no jobs or events are ever lost during sleep or restarts.

---

## ⚡ Quick Start: 60-Second Evaluation Run

Set your base URL in your terminal (local or deployed Render URL):

```bash
# For local evaluation:
export BASE_URL="http://localhost:3000"

# Or for live cloud evaluation:
# export BASE_URL="https://webhookdispatcher-w948.onrender.com"
```

### 1. Verify Service & Database Health
```bash
curl -i "$BASE_URL/health"
```
*Expected output (`200 OK`):*
```json
{"ok": true}
```

### 2. Dispatch a Webhook (Immediate Non-Blocking `202 Accepted`)
```bash
curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
    "eventId": "evt_quickstart_001",
    "payload": {
      "event": "order.created",
      "orderId": "ord_9999",
      "amount": 4900
    }
  }'
```
*Expected output (`202 Accepted` returned in < 15ms):*
```json
{
  "status": "queued",
  "jobId": "b79bdc1f-f946-4123-bdd2-f3f6647d46ba"
}
```

### 3. Inspect Job State & Complete Delivery Attempt History
```bash
curl "$BASE_URL/api/webhooks/jobs/<JOB_ID_FROM_ABOVE>"
```
*Expected output (`200 OK`):*
```json
{
  "jobId": "b79bdc1f-f946-4123-bdd2-f3f6647d46ba",
  "eventId": "evt_quickstart_001",
  "destinationUrl": "...",
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

---

## 🧪 Evaluator cURL Test Suite (All Scenarios)

The engine includes a built-in mock destination receiver (`/mock/receiver`) to simulate every production edge-case without external dependencies:

### Test 1: Non-Blocking Ingestion with a Slow Destination (10s Downstream)
Verify that slow destinations do NOT block your API:
```bash
time curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=slow&delay=10000",
    "eventId": "evt_slow_test_001",
    "payload": { "test": "slow-downstream" }
  }'
```
*Verification:* The cURL returns `202 Accepted` immediately (~10ms). The 10-second delay occurs asynchronously in the background worker without blocking ingestion threads.

### Test 2: Idempotency & Deduplication
Send the exact same request twice:
```bash
curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
    "eventId": "evt_idempotent_test_001",
    "payload": { "test": "duplicate-check" }
  }'

# Run again with the same eventId:
curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
    "eventId": "evt_idempotent_test_001",
    "payload": { "test": "duplicate-check" }
  }'
```
*Verification:* Second request returns `202 Accepted` with `"duplicate": true` and the original `jobId`. No duplicate jobs or deliveries are created.

### Test 3: Flaky Downstream (Transient Failure $\rightarrow$ Exponential Backoff $\rightarrow$ Success)
Simulates a destination that fails twice with HTTP 500, then succeeds on attempt 3:
```bash
curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=flaky&failFirst=2",
    "eventId": "evt_flaky_test_'"$RANDOM"'",
    "payload": { "test": "flaky-recovery" }
  }'
```
*Verification:* Check `$BASE_URL/api/webhooks/jobs/<JOB_ID>`. You will see Attempt #1 (`500`), Attempt #2 (`500` after ~2s backoff), and Attempt #3 (`200 OK` after ~4s backoff), ending in `succeeded`.

### Test 4: Retry Exhaustion $\rightarrow$ Dead-Letter Queue (DLQ)
Simulates a permanently failing target (HTTP 500 across all 4 attempts):
```bash
curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=fail",
    "eventId": "evt_fail_test_'"$RANDOM"'",
    "payload": { "test": "permanent-failure" }
  }'
```
*Verification:* The engine executes 4 total attempts (1 initial + 3 retries at ~2s, ~4s, ~8s + jitter), then marks the job as `failed`. Query the DLQ endpoint to inspect it:
```bash
curl "$BASE_URL/api/webhooks/dlq"
```

### Test 5: Manual DLQ Redrive / Replay API
Take any permanently failed job from the DLQ and redrive it back into active rotation:
```bash
# Redrive a single job:
curl -i -X POST "$BASE_URL/api/webhooks/dlq/<JOB_ID>/replay"

# Or bulk redrive all failed jobs:
curl -i -X POST "$BASE_URL/api/webhooks/dlq/replay-all"
```
*Verification:* Returns `200 OK`, resets attempt count to 0, clears error, and sets status back to `queued`.

### Test 6: Non-Retryable Client Errors (HTTP 4xx / 3xx)
Verify that client errors (e.g., 404 Not Found) are not retried fruitlessly:
```bash
curl -i -X POST "$BASE_URL/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "'"$BASE_URL"'/non-existent-endpoint",
    "eventId": "evt_404_test_'"$RANDOM"'",
    "payload": { "test": "404-immediate-failure" }
  }'
```
*Verification:* Fails immediately on Attempt 1 with status `failed`. No further retries are scheduled.

### Test 7: High-Throughput Batch Ingestion API (Up to 100 Jobs)
Atomically enqueues a multi-event batch in a single database transaction:
```bash
curl -i -X POST "$BASE_URL/api/webhooks/dispatch/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "jobs": [
      {
        "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
        "eventId": "evt_batch_1_'"$RANDOM"'",
        "payload": { "orderId": "ord_1" }
      },
      {
        "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
        "eventId": "evt_batch_2_'"$RANDOM"'",
        "payload": { "orderId": "ord_2" }
      },
      {
        "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
        "eventId": "evt_batch_3_'"$RANDOM"'",
        "payload": { "orderId": "ord_3" }
      }
    ]
  }'
```
*Verification:* Returns `202 Accepted` with `{ "total": 3, "accepted": 3, "duplicates": 0, "jobs": [...] }`.

### Test 8: Per-Destination Host Token Bucket Rate Limiting (Burst Test)
Fires a rapid 15-event burst against the same destination host:
```bash
for i in $(seq 1 15); do
  curl -s -X POST "$BASE_URL/api/webhooks/dispatch" \
    -H "Content-Type: application/json" \
    -d '{
      "destinationUrl": "'"$BASE_URL"'/mock/receiver?mode=ok",
      "eventId": "evt_burst_'"$i"'_'"$RANDOM"'",
      "payload": { "burstIndex": '"$i"' }
    }' > /dev/null
done

echo "Burst enqueued! Inspecting receiver hit pace..."
curl "$BASE_URL/mock/receiver/stats"
```
*Verification:* All 15 requests return `202 Accepted` immediately. The worker throttles delivery using the token bucket (capacity: 5, refill: 2/s). Excess jobs are rescheduled without consuming attempt counts!

### Test 9: Prometheus / OpenMetrics Scraping
Inspect production metrics:
```bash
curl "$BASE_URL/metrics"
```
*Verification:* Returns valid Prometheus format including `webhook_jobs_enqueued_total`, `webhook_delivery_attempts_total`, `webhook_queue_depth`, `webhook_circuit_breaker_trips_total`, etc.

### Test 10: Server-Sent Events (SSE) Real-Time Stream
Stream delivery lifecycle events in real-time:
```bash
curl -N "$BASE_URL/api/webhooks/stream"
```
*Verification:* Pushes live events (`job:enqueued`, `job:attempt`, `job:succeeded`, `job:retrying`, `job:failed`, `job:redriven`, `circuit:tripped`) as they occur in background workers.

---

## 🖥️ Interactive Web Dashboard

Open `GET /` or `GET /dashboard` in any browser to access the visual management console:

- **System Health Monitor:** Real-time polling indicator verifying Neon PostgreSQL connectivity.
- **1-Click Simulation Buttons:** Instant testing for 200 OK, Flaky Downstream, 500 Fail retries, 10s Slow Target, 10x Rate-limit burst, and 5x Batch ingestion.
- **Real-Time SSE Live Badge:** Live stream status indicator (`SSE Live (Real-Time)`).
- **Custom Dispatch Console:** Send arbitrary JSON payloads to any destination with automatic SSRF safety checks.
- **Live Queue Inspector:** Auto-refreshes every 2 seconds, displaying status badges (`queued`, `processing`, `retrying`, `succeeded`, `failed`), attempt counts, destinations, and timestamps.
- **Dead-Letter Queue (DLQ) Card:** Table listing failed jobs with failure diagnostics, single-job "Redrive" button, and bulk "Replay All DLQ" button.
- **Delivery Attempt Audit Drawer:** Click any job to inspect granular attempt records, HTTP status codes, latencies in milliseconds, error reasons, and UTC timestamps.

---

## 📚 Table of Contents

- [Live Deployment & Deliverables](#-live-deployment--deliverables-judges-quick-links)
- [Quick Start: 60-Second Evaluation Run](#-quick-start-60-second-evaluation-run)
- [Evaluator cURL Test Suite](#-evaluator-curl-test-suite-all-scenarios)
- [Interactive Web Dashboard](#️-interactive-web-dashboard)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Architecture & Request Lifecycle](#-architecture--request-lifecycle)
- [Complete API Reference](#-complete-api-reference)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Local Development & Docker Compose](#-local-development--docker-compose)
- [Automated Test Suite (Vitest)](#-automated-test-suite-vitest)
- [Delivery Semantics & Engineering Trade-offs](#-delivery-semantics--engineering-trade-offs)
- [Security Considerations](#-security-considerations)
- [Project Structure](#-project-structure)

---

## 🌟 Key Features

### Reliable Asynchronous Delivery
- **Non-Blocking `202 Accepted`:** Ingestion validates and persists jobs in PostgreSQL in < 15ms without performing synchronous outbound network requests.
- **PostgreSQL Durable Queue:** Jobs and attempt history are stored in PostgreSQL. Workers claim due jobs using `FOR UPDATE SKIP LOCKED`, preventing double-delivery across concurrent workers without requiring Redis.
- **Stale Lock Recovery:** Workers set `locked_until = now() + 30s`. If a worker abruptly crashes mid-delivery, the lock expires automatically and is reclaimed by the next tick.

### Sophisticated Retry & Backoff Mechanics
- **Transient Failure Retries:** Retries HTTP 429, 5xx, request timeouts, and connection errors.
- **Exponential Backoff with Full Jitter:** Prevents thundering herd problems:
  $$\text{Delay} = 2000\text{ms} \times 2^{(\text{attempt} - 1)} + \text{jitter}(0\text{–}250\text{ms})$$
- **HTTP 429 `Retry-After` Support:** Respects downstream `Retry-After` header values (in seconds).
- **Fast Rejection on Client Errors:** 4xx errors (e.g. 400, 401, 403, 404) and 3xx redirects fail immediately on Attempt 1 without wasting retries.
- **Strict Attempt Caps:** Default is **4 total attempts** (1 initial attempt + 3 retries).

### High-Availability Rate Limiting & Circuit Breaking
- **Hybrid Token Bucket Rate Limiting:** Per-destination host token bucket (capacity: 5, refill: 2/s).
- **Optional Distributed Redis Token Bucket:** When `REDIS_URL` is configured, rate limits are coordinated across multiple cluster nodes using an atomic Lua script (`EVAL`).
- **In-Memory Fallback:** Automatically falls back to an in-memory token bucket if Redis is not configured or unavailable.
- **Destination Circuit Breaker:** Tracks consecutive downstream failures per host:
  - `CLOSED`: Normal operation.
  - `OPEN`: Tripped after 5 consecutive failures; fast-reschedules jobs for 30s cooldown without burning worker sockets.
  - `HALF_OPEN`: Probes with 1 test request after cooldown to evaluate destination recovery.

### Observability & Operational Control
- **Dead-Letter Queue (DLQ):** Search and paginate permanently failed jobs; redrive individual jobs or bulk replay all dead-letter jobs.
- **High-Throughput Batch Ingestion:** Ingest up to 100 webhooks in a single atomic database query (`POST /api/webhooks/dispatch/batch`).
- **Prometheus Metrics:** Standard `/metrics` endpoint with queue depths, delivery outcomes, and latency tracking.
- **Server-Sent Events (SSE):** Real-time streaming at `/api/webhooks/stream` backed by a unified EventBus (Redis Pub/Sub or EventEmitter).

---

## 🛠️ Technology Stack

| Layer | Technology | Rationale & Purpose |
|---|---|---|
| **Runtime** | Node.js 20+ (LTS) | Modern asynchronous JavaScript runtime with native `fetch` and `AbortController`. |
| **Language** | TypeScript 5.8 | End-to-end type safety with strict mode enabled. |
| **HTTP Framework** | Fastify 5.2 | High-throughput, low-overhead HTTP engine with built-in schema validation and route-scoped rate limiting. |
| **Database** | PostgreSQL 16 (Neon / Supabase / Local) | Durable, transactional storage for jobs and delivery attempts. |
| **Database Client** | `pg` (node-postgres) | Native connection pooling with parameterized SQL queries preventing SQL injection. |
| **Queue Mechanism** | PostgreSQL `FOR UPDATE SKIP LOCKED` | Zero-dependency durable queueing with row-level locks eliminating race conditions. |
| **Distributed State** | Redis 7 + `ioredis` (Optional) | Multi-instance distributed token bucket via Lua scripts and Pub/Sub event broadcasting. |
| **Validation** | Zod 3.24 | Strict request payload and URL schema validation. |
| **Rate Limiting** | `@fastify/rate-limit` + Custom Token Bucket | Ingestion rate limiting (100 req/min) and per-host egress throttling (5 cap, 2/s refill). |
| **Logging** | Pino (via Fastify) | High-performance structured JSON logging. |
| **Testing** | Vitest 3.2 | Fast test runner executing 38 automated unit, integration, and resiliency tests. |
| **Containerization** | Docker & Docker Compose | Multi-stage production container and one-command local development stack. |

---

## 📐 Architecture & Request Lifecycle

```text
                Client (Producer)
                       │
                       │ POST /api/webhooks/dispatch (Single)
                       │ POST /api/webhooks/dispatch/batch (Batch up to 100)
                       ▼
┌────────────────────────────────────────────────────────┐
│ Fastify API                                            │
│ 1. Validate payload with Zod                           │
│ 2. Validate URL (SSRF & protocol check)                │
│ 3. Atomic INSERT ... ON CONFLICT (event_id) DO NOTHING │
│ 4. Emit event to EventBus (Redis Pub/Sub / Local)      │
│ 5. Reply 202 Accepted (instant, non-blocking < 15ms)   │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ PostgreSQL 16 (Neon / Local)                           │
│ - jobs table (queued, processing, retrying,            │
│               succeeded, failed)                       │
│ - delivery_attempts table (audit trail)                │
└───────────────────────▲────────────────────────────────┘
                        │
                        │ Claim due jobs: FOR UPDATE SKIP LOCKED
                        │ (locked_until = now() + 30s)
┌───────────────────────┴────────────────────────────────┐
│ Worker Pool (Concurrency cap: 5 in-flight)             │
│                                                        │
│ For each claimed job:                                  │
│   ├── 1. Circuit Breaker check (CLOSED/OPEN/HALF_OPEN) │
│   │        └── If OPEN: fast-reschedule (no HTTP call) │
│   ├── 2. Token Bucket check (per destination host)     │
│   │        └── If limited: reschedule, 0 attempts used │
│   ├── 3. Dispatch POST destinationUrl (5s timeout)     │
│   │        ├── Headers: X-Webhook-Event-Id, Attempt    │
│   │        ├── Optional HMAC signature header          │
│   │        └── redirect: "manual" (no redirects)       │
│   ├── 4. Record delivery_attempts audit row            │
│   └── 5. Update job status:                            │
│            ├── 2xx ───────────► Succeeded              │
│            ├── 429/5xx/timeout ► Exponential Backoff   │
│            │                     (or Failed if max = 4)│
│            └── Other 4xx/3xx ─► Failed (no retry)      │
└────────────────────────────────────────────────────────┘
```

### Exponential Backoff Schedule Table

$$\text{Delay} = 2000\text{ms} \times 2^{(\text{attempt} - 1)} + \text{jitter}(0\text{–}250\text{ms})$$

| Attempt # | Scheduled Timing | Typical Delay | Behavior on Failure |
|:---:|:---|:---:|:---|
| **1** | Immediate | 0s | Schedule Attempt 2 with ~2s delay |
| **2** | After Attempt 1 fails | ~2s | Schedule Attempt 3 with ~4s delay |
| **3** | After Attempt 2 fails | ~4s | Schedule Attempt 4 with ~8s delay |
| **4** | After Attempt 3 fails | ~8s | **Max attempts exhausted:** Mark `failed`, route to DLQ |

---

## 📖 Complete API Reference

### 1. Ingestion Endpoints

#### `POST /api/webhooks/dispatch`
Enqueues a single webhook job.
- **Request Body:**
  ```json
  {
    "destinationUrl": "https://api.partner.com/webhook",
    "eventId": "evt_order_12345",
    "payload": { "event": "order.placed", "total": 9900 }
  }
  ```
- **Responses:**
  - `202 Accepted`: `{ "status": "queued", "jobId": "..." }`
  - `202 Accepted (Duplicate)`: `{ "status": "queued", "jobId": "...", "duplicate": true }`
  - `400 Bad Request`: Validation failure or private SSRF target.
  - `413 Payload Too Large`: Payload exceeds 100 KB limit.
  - `429 Too Many Requests`: Ingestion rate limit exceeded (100 req/min per IP).

#### `POST /api/webhooks/dispatch/batch`
Atomically enqueues between 1 and 100 webhook jobs in a single database transaction.
- **Request Body:**
  ```json
  {
    "jobs": [
      {
        "destinationUrl": "https://api.partner.com/webhook",
        "eventId": "evt_bulk_1",
        "payload": { "id": 1 }
      },
      {
        "destinationUrl": "https://api.partner.com/webhook",
        "eventId": "evt_bulk_2",
        "payload": { "id": 2 }
      }
    ]
  }
  ```
- **Response `202 Accepted`:**
  ```json
  {
    "status": "queued",
    "total": 2,
    "accepted": 2,
    "duplicates": 0,
    "jobs": [
      { "eventId": "evt_bulk_1", "jobId": "...", "status": "queued", "duplicate": false },
      { "eventId": "evt_bulk_2", "jobId": "...", "status": "queued", "duplicate": false }
    ]
  }
  ```

---

### 2. Job Status & DLQ Endpoints

#### `GET /api/webhooks/jobs/:jobId`
Retrieves current job status and complete attempt history.
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

#### `GET /api/webhooks/jobs`
Lists recent jobs. Query params: `?status=queued|processing|retrying|succeeded|failed` and `?limit=20`.

#### `GET /api/webhooks/dlq`
Lists permanently failed dead-letter jobs. Query params: `?limit=20&offset=0&search=partner.com`.

#### `POST /api/webhooks/dlq/:jobId/replay`
Manually redrives a failed job: resets attempts to 0, clears error, and sets status back to `queued`.

#### `POST /api/webhooks/dlq/replay-all`
Bulk redrives all failed dead-letter jobs back into the active queue.

---

### 3. Observability & Telemetry Endpoints

#### `GET /health`
Verifies live PostgreSQL database connectivity (`SELECT 1`). Returns `200 OK` or `503 Service Unavailable`.

#### `GET /metrics`
Exposes real-time Prometheus / OpenMetrics text exposition.

#### `GET /api/webhooks/stream`
Server-Sent Events connection streaming real-time delivery lifecycle events (`job:enqueued`, `job:attempt`, `job:succeeded`, `job:retrying`, `job:failed`, `job:redriven`, `circuit:tripped`).

---

## ⚙️ Configuration & Environment Variables

Create a `.env` file in the project root:

| Variable | Default | Description |
|---|:---:|---|
| `PORT` | `3000` | HTTP port (Render/Railway sets this automatically). |
| `DATABASE_URL` | *Required* | PostgreSQL connection string (`sslmode=require` for Neon). |
| `REDIS_URL` | *Unset* | Optional Redis connection string for distributed rate limiting and pub/sub. |
| `WORKER_CONCURRENCY` | `5` | Maximum simultaneous outbound HTTP deliveries in flight. |
| `POLL_INTERVAL_MS` | `500` | Worker queue polling frequency in milliseconds. |
| `DELIVERY_TIMEOUT_MS` | `5000` | Outbound request timeout via `AbortController` (5 seconds). |
| `MAX_ATTEMPTS` | `4` | Total attempts allowed: 1 initial attempt + 3 retries. |
| `BACKOFF_BASE_MS` | `2000` | Base exponential backoff delay (2 seconds). |
| `RATE_BUCKET_CAPACITY` | `5` | Max burst tokens allowed per destination host. |
| `RATE_REFILL_PER_SEC` | `2` | Tokens replenished per second per destination host. |
| `INGEST_RATE_LIMIT_PER_MIN` | `100` | Ingestion rate limit per client IP. |
| `ALLOW_PRIVATE_DESTINATIONS` | `false` | Set `true` only for local testing to allow loopback addresses. |
| `WEBHOOK_SIGNING_SECRET` | *Unset* | Secret used to generate HMAC SHA-256 `X-Webhook-Signature` header. |
| `CIRCUIT_BREAKER_FAILURES` | `5` | Consecutive failures before tripping circuit OPEN. |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Cooldown period before transitioning to HALF_OPEN (30s). |

---

## 💻 Local Development & Docker Compose

### Option A: Local Node.js Development

```bash
# 1. Clone the repository
git clone https://github.com/piverine/WebhookDispatcher.git
cd WebhookDispatcher

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 4. Start in watch mode (auto-runs migrations on startup)
npm run dev

# 5. Open Dashboard in browser
open http://localhost:3000/dashboard
```

### Option B: One-Command Docker Compose Stack

Spin up the entire distributed engine with local PostgreSQL 16 and Redis 7:

```bash
docker compose up --build
```

Services started:
- `webhook-dispatcher-app`: `http://localhost:3000`
- `webhook-dispatcher-postgres`: `localhost:5432`
- `webhook-dispatcher-redis`: `localhost:6379`

---

## 🧪 Automated Test Suite (Vitest)

Run the full automated test suite:

```bash
npm test
```

### Test Coverage Summary (38 Tests Passing across 14 Suites):
- `tests/integration.test.ts`: End-to-end flow (dispatch $\rightarrow$ retry on flaky $\rightarrow$ succeeded).
- `tests/ratelimit.test.ts`: Token bucket bursting, token replenishment, and slow target non-blocking check.
- `tests/retry.test.ts`: Exponential backoff calculation, 429 `Retry-After`, and non-retryable 4xx fast-failure.
- `tests/hardening.test.ts`: 100 KB payload limit, redirect handling (`redirect: "manual"`), and HMAC signatures.
- `tests/circuitBreaker.test.ts`: `CLOSED` $\rightarrow$ `OPEN` $\rightarrow$ `HALF_OPEN` state transitions.
- `tests/batch.test.ts`: Atomic multi-row batch ingestion and duplicate handling.
- `tests/dlq.test.ts`: Dead-letter queue listing, single job redrive, and bulk replay.
- `tests/metrics.test.ts`: Prometheus OpenMetrics format validation.
- `tests/dashboard.test.ts`: Content negotiation on `GET /` and HTML dashboard serving.
- `tests/dispatch.test.ts`: Ingestion validation, idempotency, and SSRF guard checks.
- `tests/worker.test.ts`: Worker poll loop and attempt tracking.
- `tests/health.test.ts`: Database connectivity health check.
- `tests/backoff.test.ts`: Backoff mathematical curve and jitter bounds.
- `tests/urlGuard.test.ts`: Private IP, localhost, IPv6, and link-local SSRF blocking.

---

## ⚖️ Delivery Semantics & Engineering Trade-offs

### 1. PostgreSQL as the Persistent Queue (`FOR UPDATE SKIP LOCKED`)
- **Decision:** Use PostgreSQL row-level locks instead of requiring an external broker like Redis/RabbitMQ.
- **Trade-off:** PostgreSQL handles transactional persistence, duplicate detection, attempt logging, and queueing in a single acid-compliant database. Using `FOR UPDATE SKIP LOCKED` allows multiple workers to poll concurrently without contention or duplicate claims.

### 2. At-Least-Once Delivery Guarantees
- **Guarantee:** The engine guarantees **at-least-once delivery**.
- **Explanation:** If a worker delivers a webhook but crashes before writing the success record to PostgreSQL, the lock expires after 30 seconds and the job is redelivered.
- **Consumer Recommendation:** Downstream consumers should inspect `X-Webhook-Event-Id` to implement idempotent processing.

### 3. Distributed Redis Rate Limiter with In-Memory Fallback
- **Decision:** Hybrid rate limiter interface (`IRateLimiter`).
- **Trade-off:** In cloud environments with multiple container replicas, an atomic Lua script in Redis guarantees that the rate limit bucket is shared globally per destination host. If Redis is unavailable or unconfigured, it gracefully falls back to local in-memory token buckets without dropping jobs.

### 4. Architectural Interview Question
> **Scenario:** A client sends a request to your API. Your API saves the job in the queue and returns `202 Accepted`. The destination server is still down. What should happen next?
> 
> **Answer:** **B. The background worker should retry delivery using exponential backoff.**
> 
> **Why?** The ingestion API has completed its contract by durably storing the delivery intent. The background worker autonomously attempts delivery, observes the failure, and reschedules the job with exponential backoff and jitter ($Delay = 2000 \times 2^{(\text{attempt}-1)} + \text{jitter}$), protecting upstream throughput and downstream availability.

---

## 🔒 Security Considerations

- **SSRF Protection:** `src/lib/urlGuard.ts` strictly blocks loopback (`127.0.0.0/8`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local addresses (`169.254.0.0/16`), IPv6 loopback (`::1`), and non-HTTP protocols.
- **Payload HMAC Signatures:** When `WEBHOOK_SIGNING_SECRET` is set, outgoing requests include `X-Webhook-Signature` with an HMAC SHA-256 digest of the raw JSON body.
- **Payload Limits:** Fastify enforces a strict 100 KB payload limit to prevent memory exhaustion attacks.
- **SQL Injection Prevention:** 100% of SQL queries use parameterized arguments (`$1, $2, ...`).
- **No Secrets in Bundles:** Environment variables and database credentials are kept exclusively server-side.

---

## 📁 Project Structure

```text
.
├── src/
│   ├── lib/
│   │   ├── circuitBreaker.ts        # Destination circuit breaker (Closed/Open/Half-Open)
│   │   ├── events.ts                # Unified EventBus (Redis Pub/Sub & EventEmitter)
│   │   ├── metrics.ts               # Prometheus metrics collector & formatter
│   │   ├── signature.ts             # HMAC SHA-256 webhook payload signing
│   │   └── urlGuard.ts              # SSRF protection & IP range validator
│   ├── queue/
│   │   └── jobs.repo.ts             # PostgreSQL repo with FOR UPDATE SKIP LOCKED
│   ├── ratelimit/
│   │   ├── limiterFactory.ts        # Factory choosing Redis or in-memory limiter
│   │   ├── rateLimiter.interface.ts # Universal RateLimiter interface
│   │   ├── redisRateLimiter.ts      # Distributed Redis Token Bucket (atomic Lua script)
│   │   └── tokenBucket.ts           # In-memory Token Bucket rate limiter
│   ├── routes/
│   │   ├── batch.ts                 # POST /api/webhooks/dispatch/batch (up to 100 jobs)
│   │   ├── dispatch.ts              # POST /api/webhooks/dispatch (202 Accepted)
│   │   ├── dlq.ts                   # Dead-letter queue inspection & redrive API
│   │   ├── health.ts                # GET /health (PostgreSQL ping)
│   │   ├── jobs.ts                  # GET /api/webhooks/jobs & :jobId attempt history
│   │   ├── metrics.ts               # GET /metrics (Prometheus text exposition)
│   │   ├── mock.ts                  # POST /mock/receiver (Built-in test target)
│   │   └── stream.ts                # GET /api/webhooks/stream (Server-Sent Events)
│   ├── ui/
│   │   └── dashboard.ts             # Standalone dark-mode Web Dashboard
│   ├── worker/
│   │   ├── backoff.ts               # Exponential backoff & jitter calculations
│   │   ├── deliver.ts               # Outbound HTTP dispatch & failure classification
│   │   └── worker.ts                # Worker loop & crash recovery manager
│   ├── config.ts                    # Environment configuration loader
│   ├── db.ts                        # PostgreSQL connection pool & migrations runner
│   └── server.ts                    # Fastify application entrypoint
├── migrations/
│   └── 001_init.sql                 # Initial schema for jobs & delivery_attempts
├── tests/                           # 14 Vitest suites covering all features
├── Dockerfile                       # Multi-stage production container
├── docker-compose.yml               # Local stack with PostgreSQL 16 & Redis 7
├── tsconfig.json                    # TypeScript compiler configuration
├── vitest.config.ts                 # Vitest test configuration
└── README.md
```
