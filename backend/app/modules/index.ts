/**
 * Module registration.
 *
 * Every feature module is mounted here and gets what it needs injected. Modules
 * never import each other; this file is the only place that knows about more
 * than one of them, and import/no-restricted-paths enforces that.
 */

import type { Express } from 'express';
import { EventEmitter } from 'node:events';

import { logger } from '../common/utils/logger.util.js';
import { startupStatus } from '../common/utils/startup-status.util.js';
import { config, env } from '../config/index.js';
import { redis } from '../lib/redis.js';
import { initSessionModule } from './session/index.js';
import { initAdminModule } from './admin/index.js';

// Cross-module communication without imports between modules.
const globalEventEmitter = new EventEmitter();
globalEventEmitter.setMaxListeners(50);

/**
 * The session is mounted on its own and earlier than the rest.
 *
 * It has to sit in front of the rate limiter, whose key is the session id: a
 * limiter that runs first sees no session and puts every visitor behind one
 * address into the same bucket. And it has to sit behind `trust proxy`, or the
 * secure cookie is dropped on the plain http hop from nginx to the container.
 * That is a decision about the order of the middleware chain, which belongs to
 * app.ts, so it gets its own call instead of hiding inside registerModules.
 */
export function registerSessionMiddleware(app: Express): void {
  try {
    initSessionModule(app, {
      sessionSecret: env.SESSION_SECRET,
      cookieName: env.SESSION_COOKIE_NAME,
      maxAgeMs: env.SESSION_MAX_AGE,
      isProduction: config.isProduction,
      // Injected, not imported: the module must not know where the connection
      // comes from. server.ts has already awaited connectRedis() by now.
      redisClient: redis,
    });
    startupStatus.moduleOk('Session');
  } catch (error) {
    startupStatus.moduleFail('Session', error);
    throw error;
  }
}

export async function registerModules(app: Express): Promise<void> {
  logger.info('[Modules] Starting module registration...');

  try {
    initAdminModule(app, { adminToken: env.ADMIN_TOKEN });
    startupStatus.moduleOk('Admin');
  } catch (error) {
    startupStatus.moduleFail('Admin', error);
  }

  // notebooks and sources arrive in M2-T1, chat in M3-T3, notes in M5-T4,
  // studio in M6-T1.

  logger.info('[Modules] All modules registered successfully');
  startupStatus.logSummary();
  return Promise.resolve();
}

export { globalEventEmitter };
