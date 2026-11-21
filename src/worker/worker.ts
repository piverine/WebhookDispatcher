import { config } from "../config.js";
import { claimDueJobs, rescheduleRateLimited } from "../queue/jobs.repo.js";
import { IRateLimiter } from "../ratelimit/rateLimiter.interface.js";
import { createRateLimiter, defaultLimiter } from "../ratelimit/limiterFactory.js";
import { deliverJob, DeliveryLogger } from "./deliver.js";

export class WorkerManager {
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;
  private inFlight = 0;
  private isStopping = false;
  private logger?: DeliveryLogger;
  private limiter: IRateLimiter;
  private activeDeliveries = new Set<Promise<void>>();

  constructor(logger?: DeliveryLogger, limiter: IRateLimiter = defaultLimiter) {
    this.logger = logger;
    this.limiter = limiter;
  }

  public getInFlightCount(): number {
    return this.inFlight;
  }

  public start(): void {
    if (this.timer) return;
    this.isStopping = false;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger?.error({ err }, "Unhandled error in worker tick loop");
      });
    }, config.pollIntervalMs);
  }

  public async tick(): Promise<void> {
    if (this.isStopping || this.isTickRunning) return;

    this.isTickRunning = true;
    try {
      const freeSlots = config.workerConcurrency - this.inFlight;
      if (freeSlots <= 0) {
        return;
      }

      // Claim jobs using FOR UPDATE SKIP LOCKED
      // Also picks up jobs with expired locked_until (crash recovery)
      const claimedJobs = await claimDueJobs(freeSlots);
      if (claimedJobs.length === 0) {
        return;
      }

      for (const job of claimedJobs) {
        this.inFlight++;
        // Execute delivery asynchronously without awaiting all (parallel execution up to concurrency cap)
        const deliveryPromise = (async () => {
          try {
            await deliverJob(job, this.limiter, this.logger);
          } catch (deliverErr) {
            // Hard rule 3: One failing job must never crash the worker loop.
            this.logger?.error(
              { jobId: job.id, err: deliverErr },
              "Unexpected exception in deliverJob, rescheduling safely"
            );
            try {
              // Reschedule 5s into future so job doesn't stay locked indefinitely
              await rescheduleRateLimited(job.id, new Date(Date.now() + 5000));
            } catch (rescheduleErr) {
              this.logger?.error({ err: rescheduleErr }, "Failed to reschedule stuck job");
            }
          } finally {
            this.inFlight--;
          }
        })();

        this.activeDeliveries.add(deliveryPromise);
        deliveryPromise.finally(() => {
          this.activeDeliveries.delete(deliveryPromise);
        });
      }
    } finally {
      this.isTickRunning = false;
    }
  }

  /**
   * Waits for all currently active deliveries to settle.
   */
  public async waitForIdle(): Promise<void> {
    while (this.activeDeliveries.size > 0) {
      await Promise.allSettled(Array.from(this.activeDeliveries));
    }
  }

  /**
   * Graceful stop: stops claiming new jobs and waits up to maxWaitMs for in-flight jobs.
   */
  public async stop(maxWaitMs = 10000): Promise<void> {
    this.isStopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const start = Date.now();
    while (this.inFlight > 0 && Date.now() - start < maxWaitMs) {
      await this.waitForIdle();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export const globalWorker = new WorkerManager(undefined, createRateLimiter());
