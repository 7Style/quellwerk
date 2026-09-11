/**
 * Anonymous session (ADR-0005). A signed cookie backed by a Redis store, thirty
 * days, no accounts. Every notebook query is scoped to the session; a notebook
 * that belongs to someone else answers 404 and not 403, so a guessed id is
 * never confirmed.
 *
 * The demo notebook is the one exception: readable by everyone, and the first
 * write copies it into the caller's own session (copy-on-first-write, M7-T1).
 *
 * The Redis client is injected, not imported. A module never reaches into a
 * shared area for a connection; modules/index.ts owns the wiring.
 */
import { RedisStore } from 'connect-redis';
import type { Express } from 'express';
import type session from 'express-session';

import { createSessionMiddleware, ensureSession, sessionIdOf } from './internal/session.middleware.js';

export interface SessionModuleDeps {
  sessionSecret: string;
  cookieName: string;
  maxAgeMs: number;
  isProduction: boolean;
  /**
   * node-redis client, already connected. Typed loosely because connect-redis
   * accepts both a client and a cluster and declares the option as `any`;
   * narrowing it here would only invent a contract the library does not have.
   */
  redisClient?: unknown;
  /** Overrides the Redis store. Tests pass the in-memory store. */
  store?: session.Store;
  /**
   * Paths that never start a session. The health endpoints, because the
   * container healthcheck polls one of them every fifteen seconds and would
   * otherwise fill Redis with sessions nobody ever comes back to.
   */
  noSessionPaths?: readonly string[];
}

/** Infrastructure, not product: liveness probes and the service banner. */
const DEFAULT_NO_SESSION_PATHS = ['/', '/health', '/api/health'] as const;

/**
 * A prefix of its own, because the same Redis also holds the rate-limit
 * counters and, from M2-T2, the BullMQ queues. Three tenants in one keyspace
 * are fine as long as none of them can be flushed by mistake for another.
 */
const KEY_PREFIX = 'qw:sess:';

export function initSessionModule(app: Express, deps: SessionModuleDeps): void {
  const store =
    deps.store ??
    (deps.redisClient
      ? new RedisStore({
          client: deps.redisClient,
          prefix: KEY_PREFIX,
          // Seconds here, milliseconds in the cookie. Without this the store
          // would fall back to its own one-day default and sessions would
          // expire in Redis four weeks before the cookie says they do.
          ttl: Math.floor(deps.maxAgeMs / 1000),
        })
      : undefined);

  app.use(
    createSessionMiddleware({
      secret: deps.sessionSecret,
      cookieName: deps.cookieName,
      maxAgeMs: deps.maxAgeMs,
      isProduction: deps.isProduction,
      ...(store ? { store } : {}),
    })
  );
  app.use(ensureSession(deps.noSessionPaths ?? DEFAULT_NO_SESSION_PATHS));
}

export { sessionIdOf };
