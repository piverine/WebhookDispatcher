export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webhook Dispatcher Engine | Operations Console</title>
  <style>
    :root {
      --bg: #0c0f14;
      --surface: #12171f;
      --surface-elevated: #181f2a;
      --surface-hover: #1c2433;
      --border: #212a39;
      --border-muted: #18202c;
      --border-focus: #3b82f6;

      --text-main: #f1f4f8;
      --text-muted: #8b96a5;
      --text-dim: #5c6878;

      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --primary-subtle: rgba(59, 130, 246, 0.12);

      --success: #10b981;
      --success-subtle: rgba(16, 185, 129, 0.12);
      --success-border: rgba(16, 185, 129, 0.25);

      --warning: #f59e0b;
      --warning-subtle: rgba(245, 158, 11, 0.12);
      --warning-border: rgba(245, 158, 11, 0.25);

      --danger: #ef4444;
      --danger-subtle: rgba(239, 68, 68, 0.12);
      --danger-border: rgba(239, 68, 68, 0.25);

      --info: #0284c7;
      --info-subtle: rgba(2, 132, 199, 0.12);
      --info-border: rgba(2, 132, 199, 0.25);

      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --font-mono: ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    ::selection {
      background: rgba(59, 130, 246, 0.3);
      color: #fff;
    }

    body {
      background: var(--bg);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #323f54; }

    /* Top Navigation Bar */
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .header-inner {
      max-width: 1520px;
      margin: 0 auto;
      padding: 0.65rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.25rem;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
    }

    .brand-titles {
      display: flex;
      flex-direction: column;
    }

    h1 {
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .version-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-weight: 500;
    }

    .system-stack {
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .header-telemetry {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 500;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-dim);
    }
    .status-dot.active { background: var(--success); }
    .status-dot.warn { background: var(--warning); }
    .status-dot.err { background: var(--danger); }

    .nav-link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: color 0.12s ease, background 0.12s ease;
    }
    .nav-link:hover {
      color: var(--text-main);
      background: var(--surface-elevated);
    }

    /* Layout */
    main {
      max-width: 1520px;
      margin: 0 auto;
      padding: 1.25rem;
      width: 100%;
      flex: 1;
      display: grid;
      grid-template-columns: 440px 1fr;
      gap: 1.25rem;
    }

    @media (max-width: 1120px) {
      main { grid-template-columns: 1fr; }
    }

    .panel-stack {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      padding: 0.75rem 1rem;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .panel-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      letter-spacing: -0.01em;
    }

    .panel-meta {
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .panel-body {
      padding: 1rem;
    }

    /* Preset Matrix */
    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .preset-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.4rem;
      margin-bottom: 1rem;
    }

    .btn-preset {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 0.5rem 0.65rem;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.12s, background 0.12s;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .btn-preset:hover {
      background: var(--surface-hover);
      border-color: #2f3c52;
    }
    .btn-preset:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    .btn-preset .preset-name {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .btn-preset .preset-desc {
      font-size: 10.5px;
      color: var(--text-muted);
      font-weight: 400;
    }

    /* Forms */
    .form-group {
      margin-bottom: 0.85rem;
    }

    label {
      display: block;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 0.3rem;
      letter-spacing: 0.02em;
    }

    input, textarea, select {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.45rem 0.65rem;
      color: var(--text-main);
      font-size: 12.5px;
      font-family: var(--font-sans);
      outline: none;
      transition: border-color 0.12s ease;
    }

    input:focus, textarea:focus, select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary);
    }

    textarea {
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 1.45;
      resize: vertical;
      min-height: 96px;
    }

    .btn-submit {
      background: var(--primary);
      color: #ffffff;
      border: 1px solid #2563eb;
      border-radius: 4px;
      padding: 0.55rem 0.85rem;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: background 0.12s, border-color 0.12s;
    }
    .btn-submit:hover {
      background: var(--primary-hover);
      border-color: #1d4ed8;
    }
    .btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-submit:focus-visible {
      outline: 2px solid #93c5fd;
      outline-offset: 1px;
    }

    .dispatch-result {
      margin-top: 0.75rem;
      padding: 0.6rem 0.75rem;
      border-radius: 4px;
      font-size: 11.5px;
      font-family: var(--font-mono);
      white-space: pre-wrap;
      word-break: break-all;
      display: none;
    }
    .dispatch-result.success {
      background: var(--success-subtle);
      border: 1px solid var(--success-border);
      color: #34d399;
      display: block;
    }
    .dispatch-result.error {
      background: var(--danger-subtle);
      border: 1px solid var(--danger-border);
      color: #f87171;
      display: block;
    }

    /* Metric telemetry bar */
    .metric-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: var(--border);
      border-bottom: 1px solid var(--border);
    }

    .metric-cell {
      background: var(--surface);
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .metric-val {
      font-size: 1.35rem;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: -0.02em;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }

    .metric-label {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* Data Tables */
    .table-container {
      overflow-x: auto;
      flex: 1;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }

    th {
      background: var(--surface-elevated);
      padding: 0.55rem 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }

    td {
      padding: 0.55rem 0.85rem;
      border-bottom: 1px solid var(--border-muted);
      vertical-align: middle;
      white-space: nowrap;
    }

    tr:hover td {
      background: var(--surface-hover);
      cursor: pointer;
    }

    .mono {
      font-family: var(--font-mono);
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
    }

    /* Status Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.15rem 0.45rem;
      border-radius: 3px;
      font-size: 10.5px;
      font-weight: 600;
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .badge::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }

    .badge-succeeded {
      background: var(--success-subtle);
      border: 1px solid var(--success-border);
      color: #34d399;
    }
    .badge-succeeded::before { background: #34d399; }

    .badge-failed {
      background: var(--danger-subtle);
      border: 1px solid var(--danger-border);
      color: #f87171;
    }
    .badge-failed::before { background: #f87171; }

    .badge-retrying {
      background: var(--warning-subtle);
      border: 1px solid var(--warning-border);
      color: #fbbf24;
    }
    .badge-retrying::before { background: #fbbf24; }

    .badge-queued {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      color: #94a3b8;
    }
    .badge-queued::before { background: #94a3b8; }

    .badge-processing {
      background: var(--info-subtle);
      border: 1px solid var(--info-border);
      color: #38bdf8;
    }
    .badge-processing::before { background: #38bdf8; }

    /* Action Buttons */
    .btn-action {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 0.25rem 0.55rem;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      transition: background 0.12s, border-color 0.12s;
    }
    .btn-action:hover {
      background: var(--surface-hover);
      border-color: #334155;
    }
    .btn-action.btn-danger {
      color: #f87171;
      border-color: var(--danger-border);
    }
    .btn-action.btn-danger:hover {
      background: var(--danger-subtle);
    }
    .btn-action.btn-success {
      color: #34d399;
      border-color: var(--success-border);
    }
    .btn-action.btn-success:hover {
      background: var(--success-subtle);
    }

    /* Modal / Inspector */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(8, 10, 14, 0.75);
      backdrop-filter: blur(2px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }

    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      max-width: 640px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }

    .modal-header {
      padding: 0.75rem 1rem;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1rem;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }
    .close-btn:hover {
      color: var(--text-main);
      background: var(--surface-hover);
    }

    .modal-body {
      padding: 1rem;
      overflow-y: auto;
      flex: 1;
    }

    .audit-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .audit-item {
      background: var(--bg);
      border: 1px solid var(--border-muted);
      border-radius: 4px;
      padding: 0.6rem 0.75rem;
    }

    .audit-label {
      font-size: 10.5px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }

    .timeline-item {
      padding: 0.65rem 0.85rem;
      background: var(--bg);
      border: 1px solid var(--border-muted);
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }

    .svg-icon {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      display: inline-block;
      vertical-align: middle;
    }
  </style>
</head>
<body>

  <!-- Top Navigation Header -->
  <header>
    <div class="header-inner">
      <div class="brand-group">
        <div class="brand-icon">
          <svg class="svg-icon" viewBox="0 0 24 24">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <div class="brand-titles">
          <h1>
            Webhook Dispatcher Engine
            <span class="version-tag">v1.0</span>
          </h1>
          <div class="system-stack">PostgreSQL &bull; Exponential Backoff &bull; Token Bucket</div>
        </div>
      </div>

      <div class="header-telemetry">
        <div class="status-pill" id="healthBadge">
          <span class="status-dot active"></span>
          <span id="healthText">Checking DB...</span>
        </div>
        <div class="status-pill" id="sseBadge">
          <span class="status-dot active"></span>
          <span id="sseText">SSE Connecting...</span>
        </div>
        <a href="/metrics" target="_blank" class="nav-link">
          <svg class="svg-icon" viewBox="0 0 24 24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Prometheus
        </a>
        <a href="https://github.com/piverine/WebhookDispatcher" target="_blank" class="nav-link">
          <svg class="svg-icon" viewBox="0 0 24 24">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
          </svg>
          Repository
        </a>
      </div>
    </div>
  </header>

  <!-- Main Grid Workspace -->
  <main>
    <!-- Left Column: Controls & Ingestion -->
    <div class="panel-stack">
      <!-- Dispatch Webhook Panel -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg class="svg-icon" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Dispatch Webhook
          </div>
          <span class="panel-meta">HTTP 202 Ingest</span>
        </div>

        <div class="panel-body">
          <div class="section-label">Target Scenarios</div>
          <div class="preset-grid">
            <button type="button" class="btn-preset" onclick="setPreset('ok')">
              <span class="preset-name">
                <svg class="svg-icon" style="color: var(--success);" viewBox="0 0 24 24">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                200 OK Target
              </span>
              <span class="preset-desc">Instant delivery success</span>
            </button>

            <button type="button" class="btn-preset" onclick="setPreset('flaky')">
              <span class="preset-name">
                <svg class="svg-icon" style="color: var(--warning);" viewBox="0 0 24 24">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
                Flaky Target
              </span>
              <span class="preset-desc">Fails 2x &rarr; succeeds</span>
            </button>

            <button type="button" class="btn-preset" onclick="setPreset('fail')">
              <span class="preset-name">
                <svg class="svg-icon" style="color: var(--danger);" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                500 Fail Target
              </span>
              <span class="preset-desc">3 retries &rarr; DLQ</span>
            </button>

            <button type="button" class="btn-preset" onclick="setPreset('slow')">
              <span class="preset-name">
                <svg class="svg-icon" style="color: var(--info);" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                Slow Target
              </span>
              <span class="preset-desc">10s downstream wait</span>
            </button>
          </div>

          <form id="dispatchForm" onsubmit="handleDispatch(event)">
            <div class="form-group">
              <label for="destUrl">DESTINATION URL</label>
              <input type="text" id="destUrl" spellcheck="false" required>
            </div>

            <div class="form-group">
              <label for="eventId">EVENT ID (IDEMPOTENCY KEY)</label>
              <input type="text" id="eventId" spellcheck="false" required>
            </div>

            <div class="form-group">
              <label for="payload">PAYLOAD (JSON)</label>
              <textarea id="payload" spellcheck="false" required></textarea>
            </div>

            <button type="submit" class="btn-submit" id="submitBtn">
              <svg class="svg-icon" viewBox="0 0 24 24">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              <span>Dispatch Webhook</span>
            </button>
          </form>

          <div id="dispatchResult" class="dispatch-result"></div>
        </div>
      </div>

      <!-- Ingestion & Resilience Tests Panel -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg class="svg-icon" viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            Resilience & Batch Benchmarks
          </div>
        </div>

        <div class="panel-body">
          <p style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 0.85rem; line-height: 1.45;">
            Evaluate distributed rate limiting (Token Bucket capacity 5, refill 2/s) and atomic multi-row batch ingestion.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <button type="button" class="btn-action" onclick="runBurstTest()" style="justify-content: center; padding: 0.5rem;">
              <svg class="svg-icon" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
              </svg>
              10x Burst Test
            </button>

            <button type="button" class="btn-action" onclick="runBatchTest()" style="justify-content: center; padding: 0.5rem;">
              <svg class="svg-icon" viewBox="0 0 24 24">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
              5x Batch Ingest
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Live Queue & Telemetry -->
    <div class="panel-stack">
      <!-- Live Queue Panel -->
      <div class="panel" style="flex: 1;">
        <div class="panel-header">
          <div class="panel-title">
            <svg class="svg-icon" viewBox="0 0 24 24">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            Live Queue & Dispatched Jobs
          </div>

          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <select id="statusFilter" onchange="fetchJobs()" style="width: auto; padding: 0.2rem 0.5rem; font-size: 11px;">
              <option value="">All Statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="retrying">Retrying</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
            <button onclick="fetchJobs()" class="btn-action" style="padding: 0.2rem 0.5rem;">
              <svg class="svg-icon" viewBox="0 0 24 24">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <!-- Metric Telemetry Ribbon -->
        <div class="metric-strip">
          <div class="metric-cell">
            <div class="metric-val" id="statTotal">0</div>
            <div class="metric-label">Total Jobs</div>
          </div>
          <div class="metric-cell">
            <div class="metric-val" id="statSucceeded" style="color: var(--success);">0</div>
            <div class="metric-label">Succeeded</div>
          </div>
          <div class="metric-cell">
            <div class="metric-val" id="statActive" style="color: var(--primary);">0</div>
            <div class="metric-label">In-Flight / Retry</div>
          </div>
        </div>

        <!-- Table View -->
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Event ID</th>
                <th>Destination</th>
                <th style="text-align: right;">Attempts</th>
                <th style="text-align: right;">Time</th>
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

      <!-- Dead-Letter Queue (DLQ) Panel -->
      <div class="panel">
        <div class="panel-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="panel-title">
              <svg class="svg-icon" style="color: var(--danger);" viewBox="0 0 24 24">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              Dead-Letter Queue (DLQ)
            </div>
            <span id="dlqCountBadge" class="badge badge-failed">0 Dead Jobs</span>
          </div>

          <button onclick="replayAllDlq()" class="btn-action btn-danger">
            <svg class="svg-icon" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Replay All DLQ
          </button>
        </div>

        <div style="padding: 0.75rem 1rem 0; font-size: 11.5px; color: var(--text-muted);">
          Exhausted retry budget (4 attempts) or fatal non-retryable failures. Redrive reinstates job into worker execution.
        </div>

        <div class="table-container" style="max-height: 220px; overflow-y: auto;">
          <table>
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Destination</th>
                <th>Last Error</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody id="dlqTableBody">
              <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No dead-letter jobs.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- Job Audit Detail Modal -->
  <div id="jobModal" class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div class="modal-title">
          <svg class="svg-icon" viewBox="0 0 24 24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Job Audit Trail & Execution Timeline
        </div>
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
        payloadInput.value = JSON.stringify({ event: 'order.created', amount: 99.50, currency: 'USD' }, null, 2);
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
        const dot = badge ? badge.querySelector('.status-dot') : null;
        if (data.ok) {
          if (text) text.textContent = 'PostgreSQL Connected';
          if (dot) {
            dot.className = 'status-dot active';
          }
        } else {
          if (text) text.textContent = 'DB Unavailable';
          if (dot) dot.className = 'status-dot err';
        }
      } catch (e) {
        if (text) text.textContent = 'System Offline';
        const dot = badge ? badge.querySelector('.status-dot') : null;
        if (dot) dot.className = 'status-dot err';
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
          resultBox.textContent = \`Accepted 202 in \${elapsed}ms \${data.duplicate ? '(Duplicate eventId)' : ''}\\nJob ID: \${data.jobId}\`;
          fetchJobs();
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
      setTimeout(fetchJobs, 400);
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
              <td class="mono" style="color: var(--text-main); font-weight: 500;">\${job.eventId}</td>
              <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted);" class="mono">\${job.destinationUrl}</td>
              <td class="mono" style="text-align: right;">\${job.attemptCount}</td>
              <td class="mono" style="text-align: right; color: var(--text-muted);">\${date}</td>
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

        let attemptsHtml = '<div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 0.5rem;">Delivery Attempts Log</div>';
        if (job.attempts.length === 0) {
          attemptsHtml += '<div style="color: var(--text-muted); font-size: 12px; padding: 0.5rem 0;">No delivery attempts logged yet. Job is queued.</div>';
        } else {
          attemptsHtml += job.attempts.map(a => \`
            <div class="timeline-item">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span class="badge badge-\${a.status === 'success' ? 'succeeded' : 'failed'}">Attempt #\${a.attempt} &bull; \${a.status}</span>
                <span class="mono" style="font-size: 11px; color: var(--text-muted);">\${new Date(a.at).toLocaleTimeString()}</span>
              </div>
              <div class="mono" style="font-size: 11.5px; color: var(--text-main); margin-top: 4px;">
                HTTP Status: <strong>\${a.responseCode || 'Network Timeout'}</strong> &bull; Latency: <strong>\${a.durationMs || 0}ms</strong>
              </div>
              \${a.error ? \`<div style="color: #f87171; font-size: 11px; font-family: var(--font-mono); margin-top: 4px; background: rgba(239, 68, 68, 0.08); padding: 4px 6px; border-radius: 3px;">\${a.error}</div>\` : ''}
            </div>
          \`).join('');
        }

        content.innerHTML = \`
          <div class="audit-grid">
            <div class="audit-item">
              <div class="audit-label">Event ID</div>
              <div class="mono" style="font-weight: 600;">\${job.eventId}</div>
            </div>
            <div class="audit-item">
              <div class="audit-label">Status</div>
              <div><span class="badge badge-\${job.status}">\${job.status}</span></div>
            </div>
          </div>
          <div class="audit-item" style="margin-bottom: 1rem;">
            <div class="audit-label">Job UUID</div>
            <div class="mono" style="word-break: break-all; color: var(--text-muted);">\${job.jobId}</div>
          </div>
          <div class="audit-item" style="margin-bottom: 1rem;">
            <div class="audit-label">Target Destination</div>
            <div class="mono" style="word-break: break-all; color: var(--primary);">\${job.destinationUrl}</div>
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

    // Fetch Dead-Letter Queue (DLQ)
    async function fetchDlq() {
      try {
        const res = await fetch('/api/webhooks/dlq?limit=20');
        const data = await res.json();
        const tbody = document.getElementById('dlqTableBody');
        const badge = document.getElementById('dlqCountBadge');
        if (badge) badge.textContent = \`\${data.total} Dead Jobs\`;

        if (!data.jobs || data.jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No dead-letter jobs.</td></tr>';
          return;
        }

        tbody.innerHTML = data.jobs.map(j => \`
          <tr>
            <td class="mono" style="color: #f87171; font-weight: 500;">\${j.eventId}</td>
            <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted);" class="mono">\${j.destinationUrl}</td>
            <td style="font-size: 11px; color: #f87171; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" class="mono">\${j.lastError || 'Retry Exhausted'}</td>
            <td style="text-align: right;">
              <button onclick="replayDlqJob('\${j.jobId}')" class="btn-action btn-success" style="padding: 0.15rem 0.45rem;">
                Redrive
              </button>
            </td>
          </tr>
        \`).join('');
      } catch (e) {
        console.error("Error fetching DLQ:", e);
      }
    }

    async function replayDlqJob(jobId) {
      try {
        const res = await fetch('/api/webhooks/dlq/' + jobId + '/replay', { method: 'POST' });
        if (res.ok) {
          fetchDlq();
          fetchJobs();
        }
      } catch (e) {}
    }

    async function replayAllDlq() {
      try {
        const res = await fetch('/api/webhooks/dlq/replay-all', { method: 'POST' });
        if (res.ok) {
          fetchDlq();
          fetchJobs();
        }
      } catch (e) {}
    }

    async function runBatchTest() {
      const now = Date.now();
      const batch = [];
      for (let i = 1; i <= 5; i++) {
        batch.push({
          destinationUrl: baseUrl + '/mock/receiver?mode=ok',
          eventId: 'evt_batch_' + i + '_' + now,
          payload: { batchIndex: i, timestamp: now }
        });
      }

      const resultBox = document.getElementById('dispatchResult');
      try {
        const res = await fetch('/api/webhooks/dispatch/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobs: batch })
        });
        const data = await res.json();
        resultBox.className = 'dispatch-result success';
        resultBox.textContent = \`Batch 202 Accepted: \${data.accepted} queued, \${data.duplicates} duplicates\`;
        fetchJobs();
      } catch (e) {
        resultBox.className = 'dispatch-result error';
        resultBox.textContent = 'Batch dispatch failed: ' + e.message;
      }
    }

    // Server-Sent Events (SSE) Real-Time Stream
    function initSSE() {
      const sseText = document.getElementById('sseText');
      const sseBadge = document.getElementById('sseBadge');
      try {
        const source = new EventSource('/api/webhooks/stream');
        source.addEventListener('connected', () => {
          if (sseText) sseText.textContent = 'SSE Live';
          const dot = sseBadge ? sseBadge.querySelector('.status-dot') : null;
          if (dot) dot.className = 'status-dot active';
        });

        const onEvent = () => {
          fetchJobs();
          fetchDlq();
        };

        source.addEventListener('job:enqueued', onEvent);
        source.addEventListener('job:attempt', onEvent);
        source.addEventListener('job:succeeded', onEvent);
        source.addEventListener('job:retrying', onEvent);
        source.addEventListener('job:failed', onEvent);
        source.addEventListener('job:redriven', onEvent);
        source.addEventListener('circuit:tripped', onEvent);

        source.onerror = () => {
          if (sseText) sseText.textContent = 'SSE Reconnecting';
          const dot = sseBadge ? sseBadge.querySelector('.status-dot') : null;
          if (dot) dot.className = 'status-dot warn';
        };
      } catch (e) {
        if (sseText) sseText.textContent = 'SSE Offline';
        const dot = sseBadge ? sseBadge.querySelector('.status-dot') : null;
        if (dot) dot.className = 'status-dot err';
      }
    }

    // Initialize
    setPreset('ok');
    checkHealth();
    fetchJobs();
    fetchDlq();
    initSSE();
    setInterval(fetchJobs, 3000);
    setInterval(fetchDlq, 5000);
    setInterval(checkHealth, 10000);
  </script>
</body>
</html>`;
}
