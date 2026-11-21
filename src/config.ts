import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl?: string;
  workerConcurrency: number;
  pollIntervalMs: number;
  deliveryTimeoutMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  rateBucketCapacity: number;
  rateRefillPerSec: number;
  ingestRateLimitPerMin: number;
  allowPrivateDestinations: boolean;
  webhookSigningSecret: string;
  circuitBreakerFailures: number;
  circuitBreakerCooldownMs: number;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || undefined,
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 500,
  deliveryTimeoutMs: Number(process.env.DELIVERY_TIMEOUT_MS) || 5000,
  maxAttempts: Number(process.env.MAX_ATTEMPTS) || 4,
  backoffBaseMs: Number(process.env.BACKOFF_BASE_MS) || 2000,
  rateBucketCapacity: Number(process.env.RATE_BUCKET_CAPACITY) || 5,
  rateRefillPerSec: Number(process.env.RATE_REFILL_PER_SEC) || 2,
  ingestRateLimitPerMin: Number(process.env.INGEST_RATE_LIMIT_PER_MIN) || 100,
  allowPrivateDestinations: process.env.ALLOW_PRIVATE_DESTINATIONS === "true",
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET || "",
  circuitBreakerFailures: Number(process.env.CIRCUIT_BREAKER_FAILURES) || 5,
  circuitBreakerCooldownMs: Number(process.env.CIRCUIT_BREAKER_COOLDOWN_MS) || 30000,
};

export function logSafeConfig(logger: { info: (obj: object, msg: string) => void }) {
  const safeDbUrl = config.databaseUrl
    ? config.databaseUrl.replace(/:([^:@]+)@/, ":***@")
    : "not_configured";
  const safeRedisUrl = config.redisUrl
    ? config.redisUrl.replace(/:([^:@]+)@/, ":***@")
    : "not_configured";

  logger.info(
    {
      port: config.port,
      databaseUrl: safeDbUrl,
      redisUrl: safeRedisUrl,
      workerConcurrency: config.workerConcurrency,
      pollIntervalMs: config.pollIntervalMs,
      deliveryTimeoutMs: config.deliveryTimeoutMs,
      maxAttempts: config.maxAttempts,
      backoffBaseMs: config.backoffBaseMs,
      rateBucketCapacity: config.rateBucketCapacity,
      rateRefillPerSec: config.rateRefillPerSec,
      ingestRateLimitPerMin: config.ingestRateLimitPerMin,
      allowPrivateDestinations: config.allowPrivateDestinations,
      hasSigningSecret: Boolean(config.webhookSigningSecret),
      circuitBreakerFailures: config.circuitBreakerFailures,
      circuitBreakerCooldownMs: config.circuitBreakerCooldownMs,
    },
    "Application configuration loaded"
  );
}

