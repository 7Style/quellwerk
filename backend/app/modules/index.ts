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
import { initSessionModule } from './session/index.js';
import { initAdminModule } from './admin/index.js';

// Cross-module communication without imports between modules.
const globalEventEmitter = new EventEmitter();
globalEventEmitter.setMaxListeners(50);

export async function registerModules(app: Express): Promise<void> {
  logger.info('[Modules] Starting module registration...');

  try {
    initSessionModule(app, {
      sessionSecret: env.SESSION_SECRET,
      cookieName: env.SESSION_COOKIE_NAME,
      maxAgeMs: env.SESSION_MAX_AGE,
      isProduction: config.isProduction,
    });
    startupStatus.moduleOk('Session');
  } catch (error) {
    startupStatus.moduleFail('Session', error);
    throw error;
  }

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
