import { Redis } from "ioredis";
import { config } from "../config.js";
import { IRateLimiter } from "./rateLimiter.interface.js";
import { TokenBucketLimiter } from "./tokenBucket.js";

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "lastRefill")
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  lastRefill = now
else
  local elapsed = (now - lastRefill) / 1000.0
  if elapsed > 0 then
    tokens = math.min(capacity, tokens + (elapsed * refillPerSec))
    lastRefill = now
  end
end

if tokens >= 1.0 then
  tokens = tokens - 1.0
  redis.call("HMSET", key, "tokens", tokens, "lastRefill", lastRefill)
  redis.call("EXPIRE", key, 3600)
  return 1
else
  redis.call("HMSET", key, "tokens", tokens, "lastRefill", lastRefill)
  redis.call("EXPIRE", key, 3600)
  local needed = 1.0 - tokens
  local waitMs = math.ceil((needed / refillPerSec) * 1000)
  if waitMs < 50 then waitMs = 50 end
  return -waitMs
end
`;

export class RedisTokenBucketLimiter implements IRateLimiter {
  private redis: Redis;
  private fallbackLimiter: TokenBucketLimiter;
  private isConnected = false;
  private readonly capacity: number;
  private readonly refillPerSec: number;

  constructor(
    redisUrl = config.redisUrl,
    capacity = config.rateBucketCapacity,
    refillPerSec = config.rateRefillPerSec
  ) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.fallbackLimiter = new TokenBucketLimiter(capacity, refillPerSec);

    this.redis = new Redis(redisUrl || "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    this.redis
      .connect()
      .then(() => {
        this.isConnected = true;
      })
      .catch(() => {
        this.isConnected = false;
      });

    this.redis.on("error", () => {
      this.isConnected = false;
    });
    this.redis.on("connect", () => {
      this.isConnected = true;
    });
  }

  private getKey(host: string): string {
    return `rl:dest:${host}`;
  }

  public async tryTake(host: string): Promise<boolean> {
    if (!this.isConnected) {
      return this.fallbackLimiter.tryTake(host);
    }

    try {
      const res = await this.redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        this.getKey(host),
        this.capacity,
        this.refillPerSec,
        Date.now()
      );
      return Number(res) === 1;
    } catch {
      return this.fallbackLimiter.tryTake(host);
    }
  }

  public async msUntilToken(host: string): Promise<number> {
    if (!this.isConnected) {
      return this.fallbackLimiter.msUntilToken(host);
    }

    try {
      const res = await this.redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        this.getKey(host),
        this.capacity,
        this.refillPerSec,
        Date.now()
      );
      const val = Number(res);
      if (val === 1) {
        // We took a token by checking; replenish it
        await this.redis.hincrbyfloat(this.getKey(host), "tokens", 1);
        return 0;
      }
      return Math.abs(val);
    } catch {
      return this.fallbackLimiter.msUntilToken(host);
    }
  }

  public async reset(host?: string): Promise<void> {
    this.fallbackLimiter.reset();
    if (this.isConnected) {
      try {
        if (host) {
          await this.redis.del(this.getKey(host));
        } else {
          const keys = await this.redis.keys("rl:dest:*");
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        }
      } catch {}
    }
  }

  public async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {}
  }
}
