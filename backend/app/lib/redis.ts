/**
 * Redis client singleton (node-redis v6).
 *
 * Used by the express-rate-limit Redis store and the /health endpoint.
 * `connect()` must be awaited during server start-up; `close()` on shutdown.
 */
import { createClient } from 'redis';
import { redisClientOptions } from '../config/redis.config.js';
import { logger } from '../common/utils/logger.util.js';

export const redis = createClient(redisClientOptions);

// A client without an error listener throws and terminates the process.
redis.on('error', (error: unknown) => {
  logger.error('Redis client error', error);
});

redis.on('reconnecting', () => {
  logger.warn('Redis client reconnecting');
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.close();
  }
}

export function isRedisReady(): boolean {
  return redis.isReady;
}
