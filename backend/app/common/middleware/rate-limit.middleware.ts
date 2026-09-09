import rateLimit, { type Options, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../../lib/redis.js';
import { redisConfig } from '../../config/redis.config.js';

/**
 * Redis-backed store for express-rate-limit. Every limiter gets its own key
 * prefix so counters never collide between limiters or replicas.
 */
export function createRedisRateLimitStore(name: string): Store {
  return new RedisStore({
    prefix: `${redisConfig.keyPrefix.rateLimit}${name}:`,
    sendCommand: (...args: string[]) => redis.sendCommand(args),
  });
}

/**
 * Create a rate limiter backed by Redis.
 *
 * @param name    limiter name, used as Redis key prefix (`rl:<name>:`)
 * @param options express-rate-limit options (`limit`, `windowMs`, ...)
 */
export function createRateLimiter(name: string, options: Partial<Options>) {
  return rateLimit({
    ...options,
    store: createRedisRateLimitStore(name),
  });
}
