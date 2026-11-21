import { config } from "../config.js";

interface BucketState {
  tokens: number;
  lastRefillTimestamp: number;
}

/**
 * In-memory Token Bucket rate limiter per destination host.
 * 
 * Capacity: max burst tokens allowed (default: 5)
 * Refill rate: tokens added per second (default: 2)
 */
export class TokenBucketLimiter {
  private buckets = new Map<string, BucketState>();
  private readonly capacity: number;
  private readonly refillPerSec: number;

  constructor(
    capacity = config.rateBucketCapacity,
    refillPerSec = config.rateRefillPerSec
  ) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
  }

  private getOrInitBucket(host: string): BucketState {
    let bucket = this.buckets.get(host);
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefillTimestamp: Date.now(),
      };
      this.buckets.set(host, bucket);
    }
    return bucket;
  }

  private refill(bucket: BucketState): void {
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefillTimestamp) / 1000;
    if (elapsedSeconds > 0) {
      const addedTokens = elapsedSeconds * this.refillPerSec;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + addedTokens);
      bucket.lastRefillTimestamp = now;
    }
  }

  /**
   * Tries to consume 1 token for the specified host.
   * Returns true if token was consumed, false if rate limited.
   */
  public tryTake(host: string): boolean {
    const bucket = this.getOrInitBucket(host);
    this.refill(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Returns estimated milliseconds until 1 token will be available.
   */
  public msUntilToken(host: string): number {
    const bucket = this.getOrInitBucket(host);
    this.refill(bucket);

    if (bucket.tokens >= 1) {
      return 0;
    }

    const neededTokens = 1 - bucket.tokens;
    const secondsWait = neededTokens / this.refillPerSec;
    return Math.max(50, Math.ceil(secondsWait * 1000));
  }

  public reset(): void {
    this.buckets.clear();
  }
}

export const defaultLimiter = new TokenBucketLimiter();
