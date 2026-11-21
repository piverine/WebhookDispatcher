import { config } from "../config.js";
import { IRateLimiter } from "./rateLimiter.interface.js";
import { TokenBucketLimiter, defaultLimiter } from "./tokenBucket.js";
import { RedisTokenBucketLimiter } from "./redisRateLimiter.js";

export function createRateLimiter(): IRateLimiter {
  if (config.redisUrl) {
    return new RedisTokenBucketLimiter();
  }
  return defaultLimiter;
}

export { IRateLimiter, TokenBucketLimiter, RedisTokenBucketLimiter, defaultLimiter };

