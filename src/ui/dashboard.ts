export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webhook Dispatcher Engine | Live Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111726;
      --card-border: #1f293d;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #38bdf8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    header {
      background: rgba(17, 23, 38, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 1rem 1.5rem;
    }
    .header-inner {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .logo-badge {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.1rem;
      color: #fff;
    }
    h1 {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--success);
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }

    /* Main Container */
    main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem;
      width: 100%;
      flex: 1;
      display: grid;
      grid-template-columns: 420px 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 1024px) {
      main { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--card-border);
    }
    .card-title {
      font-size: 0.95rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Forms & Presets */
    .presets {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .btn-preset {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
    }
    .btn-preset:hover {
      background: rgba(99, 102, 241, 0.15);
      border-color: var(--primary);
    }
    .btn-preset span {
      display: block;
      font-size: 0.65rem;
      color: var(--text-muted);
      font-weight: 400;
      margin-top: 2px;
    }

    .form-group {
      margin-bottom: 0.85rem;
    }
    label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }
    input, textarea, select {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 0.55rem 0.75rem;
      color: var(--text-main);
      font-size: 0.82rem;
      font-family: inherit;
      outline: none;
      transition: border 0.15s;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary);
    }
    textarea {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      resize: vertical;
      min-height: 90px;
    }

    .btn-submit {
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.65rem;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: background 0.15s;
    }
    .btn-submit:hover { background: var(--primary-hover); }

    .dispatch-result {
      margin-top: 0.75rem;
      padding: 0.65rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      display: none;
    }
    .dispatch-result.success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      display: block;
    }
    .dispatch-result.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      display: block;
    }

    /* Stats Grid */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .stat-pill {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.75rem;
      text-align: center;
    }
    .stat-val {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-main);
      font-family: 'JetBrains Mono', monospace;
    }
    .stat-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 2px;
    }

    /* Table */
    .table-container {
      overflow-x: auto;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      flex: 1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      text-align: left;
    }
    th {
      background: rgba(0, 0, 0, 0.3);
      padding: 0.75rem 1rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(31, 41, 61, 0.5);
      vertical-align: middle;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
      cursor: pointer;
    }
    .mono {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-succeeded { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-failed { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-retrying { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .badge-queued { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
    .badge-processing { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }

    /* Modal / Drawer */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1.5rem;
    }
    .modal {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      max-width: 650px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-body {
      padding: 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.25rem;
      cursor: pointer;
    }
    .timeline-item {
      padding: 0.75rem;
      border-left: 2px solid var(--card-border);
      margin-left: 0.5rem;
      position: relative;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 1rem;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--primary);
    }
  </style>
</head>
<body>

  <header>
    <div class="header-inner">
      <div class="logo-group">
        <div class="logo-badge">⚡</div>
        <div>
          <h1>Webhook Dispatcher Engine</h1>
          <div class="subtitle">Distributed Queue &bull; PostgreSQL &bull; Exponential Backoff &bull; Token Bucket</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div class="status-badge" id="healthBadge">
          <div class="pulse-dot"></div>
          <span id="healthText">Checking DB...</span>
        </div>
        <a href="https://github.com/piverine/WebhookDispatcher" target="_blank" style="color: var(--text-muted); text-decoration: none; font-size: 0.8rem; font-weight: 600;">
          GitHub &rarr;
        </a>
      </div>
    </div>
  </header>

  <main>
    <!-- Left Column: Test & Dispatch Panel -->
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">🚀 Dispatch Webhook</div>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Non-blocking 202</span>
        </div>

        <div style="margin-bottom: 0.65rem; font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Presets:</div>
        <div class="presets">
          <button class="btn-preset" onclick="setPreset('ok')">
            ⚡ 200 OK Target
            <span>Instant delivery success</span>
          </button>
          <button class="btn-preset" onclick="setPreset('flaky')">
            🔄 Flaky Target
            <span>Fails 2x &rarr; succeeds</span>
          </button>
          <button class="btn-preset" onclick="setPreset('fail')">
            ❌ 500 Fail Target
            <span>3 retries &rarr; failed</span>
          </button>
          <button class="btn-preset" onclick="setPreset('slow')">
            ⏳ Slow Downstream
            <span>10s wait (dispatch fast)</span>
          </button>
        </div>

        <form id="dispatchForm" onsubmit="handleDispatch(event)">
          <div class="form-group">
            <label for="destUrl">Destination URL</label>
            <input type="text" id="destUrl" required>
          </div>
          <div class="form-group">
            <label for="eventId">Event ID (Idempotency Key)</label>
            <input type="text" id="eventId" required>
          </div>
          <div class="form-group">
            <label for="payload">Payload (JSON)</label>
            <textarea id="payload" required></textarea>
          </div>
          <button type="submit" class="btn-submit" id="submitBtn">
            <span>Send Webhook</span>
          </button>
        </form>

        <div id="dispatchResult" class="dispatch-result"></div>
      </div>

      <!-- Quick Burst Test Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🌊 Burst & Rate Limit Test</div>
        </div>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          Fires 10 webhooks in rapid succession to test token bucket rate limiting (capacity: 5, refill: 2/s).
        </p>
        <button type="button" class="btn-preset" onclick="runBurstTest()" style="text-align: center; padding: 0.65rem;">
          Trigger 10x Webhook Burst
        </button>
      </div>
    </div>

    <!-- Right Column: Live Jobs & Telemetry -->
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div class="card" style="flex: 1;">
        <div class="card-header">
          <div class="card-title">📋 Live Queue & Dispatched Jobs</div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <select id="statusFilter" onchange="fetchJobs()" style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.75rem;">
              <option value="">All Statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="retrying">Retrying</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
            <button onclick="fetchJobs()" class="btn-preset" style="padding: 0.3rem 0.6rem;">Refresh</button>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-pill">
            <div class="stat-val" id="statTotal">0</div>
            <div class="stat-label">Total Jobs</div>
          </div>
          <div class="stat-pill">
            <div class="stat-val" id="statSucceeded" style="color: var(--success);">0</div>
            <div class="stat-label">Succeeded</div>
          </div>
          <div class="stat-pill">
            <div class="stat-val" id="statActive" style="color: var(--info);">0</div>
            <div class="stat-label">In-Flight / Retry</div>
          </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Event ID</th>
                <th>Destination</th>
                <th>Attempts</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="jobsTableBody">
              <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading jobs...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- Job Detail Modal -->
  <div id="jobModal" class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div style="font-weight: 700; font-size: 0.95rem;">Job Audit Trail</div>
        <button class="close-btn" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" id="modalContent">
        Loading job attempts...
      </div>
    </div>
  </div>

  <script>
    const baseUrl = window.location.origin;

    // Presets
    function setPreset(type) {
      const now = Date.now();
      const eventIdInput = document.getElementById('eventId');
      const destUrlInput = document.getElementById('destUrl');
      const payloadInput = document.getElementById('payload');

      if (type === 'ok') {
        eventIdInput.value = 'evt_ok_' + now;
        destUrlInput.value = baseUrl + '/mock/receiver?mode=ok';
        payloadInput.value = JSON.stringify({ event: 'order.created', amount: 99 }, null, 2);
      } else if (type === 'flaky') {
        eventIdInput.value = 'evt_flaky_' + now;
        destUrlInput.value = baseUrl + '/mock/receiver?mode=flaky&failFirst=2';
        payloadInput.value = JSON.stringify({ event: 'payment.charge', retryDemo: true }, null, 2);
      } else if (type === 'fail') {
        eventIdInput.value = 'evt_fail_' + now;
        destUrlInput.value = baseUrl + '/mock/receiver?mode=fail';
        payloadInput.value = JSON.stringify({ event: 'user.deleted', shouldFail: true }, null, 2);
      } else if (type === 'slow') {
        eventIdInput.value = 'evt_slow_' + now;
        destUrlInput.value = baseUrl + '/mock/receiver?mode=slow&delay=10000';
        payloadInput.value = JSON.stringify({ event: 'report.export', heavy: true }, null, 2);
      }
    }

    // Health check
    async function checkHealth() {
      const badge = document.getElementById('healthBadge');
      const text = document.getElementById('healthText');
      try {
        const res = await fetch('/health');
        const data = await res.json();
        if (data.ok) {
          text.textContent = 'Neon DB Connected';
        } else {
          text.textContent = 'DB Unavailable';
          badge.style.color = 'var(--danger)';
        }
      } catch (e) {
        text.textContent = 'Offline';
        badge.style.color = 'var(--danger)';
      }
    }

    // Handle Dispatch
    async function handleDispatch(e) {
      e.preventDefault();
      const resultBox = document.getElementById('dispatchResult');
      const submitBtn = document.getElementById('submitBtn');

      let payloadJson;
      try {
        payloadJson = JSON.parse(document.getElementById('payload').value);
      } catch (err) {
        resultBox.className = 'dispatch-result error';
        resultBox.textContent = 'Invalid JSON in payload: ' + err.message;
        return;
      }

      submitBtn.disabled = true;
      const start = performance.now();

      try {
        const res = await fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinationUrl: document.getElementById('destUrl').value,
            eventId: document.getElementById('eventId').value,
            payload: payloadJson
          })
        });

        const elapsed = Math.round(performance.now() - start);
        const data = await res.json();

        if (res.status === 202) {
          resultBox.className = 'dispatch-result success';
          resultBox.textContent = \`Accepted 202 in \${elapsed}ms! \${data.duplicate ? '(Duplicate eventId)' : ''}\\nJob ID: \${data.jobId}\`;
          fetchJobs();
          // generate new event ID
          document.getElementById('eventId').value = 'evt_' + Date.now();
        } else {
          resultBox.className = 'dispatch-result error';
          resultBox.textContent = \`HTTP \${res.status}: \${JSON.stringify(data, null, 2)}\`;
        }
      } catch (err) {
        resultBox.className = 'dispatch-result error';
        resultBox.textContent = 'Request failed: ' + err.message;
      } finally {
        submitBtn.disabled = false;
      }
    }

    // Run Burst Test
    async function runBurstTest() {
      const button = event.target;
      button.disabled = true;
      button.textContent = 'Bursting 10 events...';

      for (let i = 1; i <= 10; i++) {
        fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinationUrl: baseUrl + '/mock/receiver?mode=ok',
            eventId: 'evt_burst_' + i + '_' + Date.now(),
            payload: { burstIndex: i }
          })
        });
      }

      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Trigger 10x Webhook Burst';
        fetchJobs();
      }, 500);
    }

    // Fetch Jobs List
    async function fetchJobs() {
      const status = document.getElementById('statusFilter').value;
      const url = '/api/webhooks/jobs?limit=50' + (status ? '&status=' + status : '');

      try {
        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('jobsTableBody');

        if (!data.jobs || data.jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No jobs found. Send a dispatch above!</td></tr>';
          return;
        }

        // Stats
        let succeeded = 0;
        let active = 0;
        data.jobs.forEach(j => {
          if (j.status === 'succeeded') succeeded++;
          if (j.status === 'retrying' || j.status === 'processing' || j.status === 'queued') active++;
        });
        document.getElementById('statTotal').textContent = data.jobs.length;
        document.getElementById('statSucceeded').textContent = succeeded;
        document.getElementById('statActive').textContent = active;

        tbody.innerHTML = data.jobs.map(job => {
          const date = new Date(job.createdAt).toLocaleTimeString();
          return \`
            <tr onclick="inspectJob('\${job.jobId}')">
              <td><span class="badge badge-\${job.status}">\${job.status}</span></td>
              <td class="mono" style="color: var(--primary);">\${job.eventId}</td>
              <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted);">\${job.destinationUrl}</td>
              <td class="mono">\${job.attemptCount}</td>
              <td style="color: var(--text-muted);">\${date}</td>
            </tr>
          \`;
        }).join('');
      } catch (e) {
        console.error("Error fetching jobs:", e);
      }
    }

    // Inspect Job Detail
    async function inspectJob(jobId) {
      const modal = document.getElementById('jobModal');
      const content = document.getElementById('modalContent');
      modal.style.display = 'flex';
      content.innerHTML = '<div style="color: var(--text-muted); padding: 1rem;">Loading attempts...</div>';

      try {
        const res = await fetch('/api/webhooks/jobs/' + jobId);
        if (!res.ok) throw new Error("Job not found");
        const job = await res.json();

        let attemptsHtml = '<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;">Attempts Audit Trail:</div>';
        if (job.attempts.length === 0) {
          attemptsHtml += '<div style="color: var(--text-muted); font-size: 0.8rem;">No delivery attempts logged yet. Job is queued.</div>';
        } else {
          attemptsHtml += job.attempts.map(a => \`
            <div class="timeline-item">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span class="badge badge-\${a.status === 'success' ? 'succeeded' : 'failed'}">Attempt #\${a.attempt} (\${a.status})</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">\${new Date(a.at).toLocaleTimeString()}</span>
              </div>
              <div style="font-size: 0.8rem; margin-top: 4px;">
                HTTP Status: <strong>\${a.responseCode || 'Network Error / Timeout'}</strong> &bull; Duration: <strong>\${a.durationMs || 0}ms</strong>
              </div>
              \${a.error ? \`<div style="color: #f87171; font-size: 0.75rem; font-family: monospace; margin-top: 4px;">Error: \${a.error}</div>\` : ''}
            </div>
          \`).join('');
        }

        content.innerHTML = \`
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Job ID</div>
            <div class="mono" style="word-break: break-all; color: var(--primary);">\${job.jobId}</div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Event ID</div>
              <div class="mono">\${job.eventId}</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Current Status</div>
              <div><span class="badge badge-\${job.status}">\${job.status}</span></div>
            </div>
          </div>
          <div style="margin-bottom: 1.5rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Destination</div>
            <div style="font-size: 0.8rem; word-break: break-all;">\${job.destinationUrl}</div>
          </div>
          \${attemptsHtml}
        \`;
      } catch (err) {
        content.innerHTML = '<div style="color: #f87171;">Error loading job: ' + err.message + '</div>';
      }
    }

    function closeModal(e) {
      if (!e || e.target.id === 'jobModal' || e.target.className === 'close-btn') {
        document.getElementById('jobModal').style.display = 'none';
      }
    }

    // Init
    setPreset('ok');
    checkHealth();
    fetchJobs();
    setInterval(fetchJobs, 2500);
    setInterval(checkHealth, 10000);
  </script>
</body>
</html>`;
}
