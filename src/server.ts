import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { config, logSafeConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { dispatchRoutes } from "./routes/dispatch.js";
import { batchRoutes } from "./routes/batch.js";
import { jobsRoutes } from "./routes/jobs.js";
import { dlqRoutes } from "./routes/dlq.js";
import { metricsRoutes } from "./routes/metrics.js";
import { streamRoutes } from "./routes/stream.js";
import { mockRoutes } from "./routes/mock.js";
import { pool, runMigrations } from "./db.js";
import { globalWorker } from "./worker/worker.js";
import { getDashboardHtml } from "./ui/dashboard.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 100 * 1024, // 100 KB limit as required in spec 3.7
  });

  // Register rate limit plugin (route-scoped)
  await app.register(rateLimit, {
    global: false,
  });

  // Root and Dashboard routes
  app.get("/dashboard", async (_req, reply) => {
    return reply.type("text/html").send(getDashboardHtml());
  });

  app.get("/", async (req, reply) => {
    const accept = req.headers.accept || "";
    // If opened in a web browser, serve the interactive visual dashboard
    if (accept.includes("text/html")) {
      return reply.type("text/html").send(getDashboardHtml());
    }

    // Default to JSON overview for curl and API consumers
    return reply.status(200).send({
      name: "Distributed Webhook Dispatcher Engine (Advanced)",
      status: "online",
      ui: "Open this URL in a web browser for the interactive dashboard",
      endpoints: {
        dashboard: "GET /dashboard",
        health: "GET /health",
        dispatch: "POST /api/webhooks/dispatch",
        batchDispatch: "POST /api/webhooks/dispatch/batch",
        jobs: "GET /api/webhooks/jobs",
        jobDetail: "GET /api/webhooks/jobs/:jobId",
        dlq: "GET /api/webhooks/dlq",
        dlqReplay: "POST /api/webhooks/dlq/:jobId/replay",
        dlqReplayAll: "POST /api/webhooks/dlq/replay-all",
        metrics: "GET /metrics",
        liveStream: "GET /api/webhooks/stream",
        mockReceiver: "POST /mock/receiver",
        mockStats: "GET /mock/receiver/stats",
      },
      documentation: "https://github.com/piverine/WebhookDispatcher",
    });
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(dispatchRoutes);
  await app.register(batchRoutes);
  await app.register(jobsRoutes);
  await app.register(dlqRoutes);
  await app.register(metricsRoutes);
  await app.register(streamRoutes);
  await app.register(mockRoutes);

  return app;
}

export async function startServer() {
  // Run migrations on startup
  try {
    await runMigrations();
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }

  const app = await buildApp();

  logSafeConfig(app.log);

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`Server listening at http://0.0.0.0:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Start background worker loop
  globalWorker.start();
  app.log.info("Worker poll loop started");

  // Error handling around process lifecycle
  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "Unhandled promise rejection detected");
  });

  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "Uncaught exception, initiating graceful shutdown");
    globalWorker.stop().finally(() => {
      app.close().finally(() => {
        pool.end().finally(() => {
          process.exit(1);
        });
      });
    });
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await globalWorker.stop();
        await app.close();
        await pool.end();
        app.log.info("Server closed successfully");
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, "Error during shutdown");
        process.exit(1);
      }
    });
  }

  return app;
}

// Run directly if this is the main module
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  startServer();
}
