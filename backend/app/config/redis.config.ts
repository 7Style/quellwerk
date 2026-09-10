import type { RedisClientOptions } from 'redis';
import { env } from './env.config.js';

/**
 * node-redis (v6) client options. The URL carries host, port, password and db.
 */
export const redisClientOptions: RedisClientOptions = {
  url: env.REDIS_URL,
  name: 'quellwerk-backend',
  socket: {
    connectTimeout: 10_000,
    // Reconnect with linear backoff, capped at 3 seconds
    reconnectStrategy: (retries: number) => Math.min(retries * 100, 3_000),
  },
};

export const redisConfig = {
  url: env.REDIS_URL,
  options: redisClientOptions,

  // Key prefixes
  keyPrefix: {
    session: 'session:',
    permission: 'perm:',
    user: 'user:',
    rateLimit: 'rl:',
    cache: 'cache:',
  },
};
