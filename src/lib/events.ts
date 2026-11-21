import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import { config } from "../config.js";

export interface WebhookEventPayloads {
  "job:enqueued": { jobId: string; eventId: string; destinationUrl: string; batch?: boolean };
  "job:attempt": {
    jobId: string;
    attempt: number;
    status: string;
    responseCode: number | null;
    durationMs: number | null;
    error: string | null;
  };
  "job:succeeded": { jobId: string; eventId: string; destinationUrl: string; durationMs: number };
  "job:retrying": { jobId: string; attempt: number; nextAttemptAt: string; delayMs: number; error: string };
  "job:failed": { jobId: string; eventId: string; destinationUrl: string; attempts: number; error: string };
  "job:redriven": { jobId?: string; count?: number };
  "circuit:tripped": { host: string; cooldownMs: number };
}

export type WebhookEventType = keyof WebhookEventPayloads;

export class UnifiedEventBus {
  private localEmitter = new EventEmitter();
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private isRedisConnected = false;

  constructor() {
    this.localEmitter.setMaxListeners(100);
    this.initRedis();
  }

  private initRedis() {
    if (!config.redisUrl) return;

    try {
      this.pubClient = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't infinite-retry if offline
      });

      this.subClient = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      Promise.all([this.pubClient.connect(), this.subClient.connect()])
        .then(() => {
          this.isRedisConnected = true;
          this.subClient?.subscribe("webhook:events", () => {});
          this.subClient?.on("message", (_channel, message) => {
            try {
              const { event, payload } = JSON.parse(message);
              this.localEmitter.emit(event, payload);
            } catch {
              // ignore invalid JSON
            }
          });
        })
        .catch(() => {
          this.isRedisConnected = false;
        });
    } catch {
      this.isRedisConnected = false;
    }
  }

  public emit<E extends WebhookEventType>(event: E, payload: WebhookEventPayloads[E]): void {
    // 1. Emit locally
    this.localEmitter.emit(event, payload);

    // 2. Publish to Redis if connected
    if (this.isRedisConnected && this.pubClient) {
      this.pubClient
        .publish("webhook:events", JSON.stringify({ event, payload }))
        .catch(() => {});
    }
  }

  public on<E extends WebhookEventType>(
    event: E,
    listener: (payload: WebhookEventPayloads[E]) => void
  ): this {
    this.localEmitter.on(event, listener);
    return this;
  }

  public off<E extends WebhookEventType>(
    event: E,
    listener: (payload: WebhookEventPayloads[E]) => void
  ): this {
    this.localEmitter.off(event, listener);
    return this;
  }

  public async close(): Promise<void> {
    if (this.pubClient) {
      try {
        await this.pubClient.quit();
      } catch {}
    }
    if (this.subClient) {
      try {
        await this.subClient.quit();
      } catch {}
    }
  }
}

export const eventBus = new UnifiedEventBus();
