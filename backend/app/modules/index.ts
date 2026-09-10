/**
 * Module registration.
 *
 * Every feature module is mounted here and gets what it needs injected.
 * Modules never import each other; this file is the only place that knows
 * about more than one of them (enforced by import/no-restricted-paths).
 */

import type { Express } from 'express';
import { EventEmitter } from 'node:events';

import { logger } from '../common/utils/logger.util.js';
import { startupStatus } from '../common/utils/startup-status.util.js';

// Cross-module communication without imports between modules.
const globalEventEmitter = new EventEmitter();
globalEventEmitter.setMaxListeners(50);

export async function registerModules(_app: Express): Promise<void> {
  logger.info('[Modules] Starting module registration...');

  // Quellwerk modules are mounted here as they arrive: session and admin in
  // M0-T4, notebooks and sources in M2, chat in M3, studio in M6, notes in M5.

  logger.info('[Modules] All modules registered successfully');
  startupStatus.logSummary();
  return Promise.resolve();
}

export { globalEventEmitter };
