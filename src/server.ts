import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { config, logSafeConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { dispatchRoutes } from "./routes/dispatch.js";
import { jobsRoutes } from "./routes/jobs.js";
import { pool, runMigrations } from "./db.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 100 * 1024, // 100 KB limit as required in spec 3.7
  });

  // Global ingestion rate limiter
  await app.register(rateLimit, {
    max: config.ingestRateLimitPerMin,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1"],
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(dispatchRoutes);
  await app.register(jobsRoutes);

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

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
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
