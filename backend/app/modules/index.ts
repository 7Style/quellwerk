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
import { createRateLimiter } from '../common/middleware/rate-limit.middleware.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { AnthropicLlmAdapter, buildCountTokensRequest } from '../adapters/llm/index.js';
import { models } from '../config/models.js';
import { createUploadMiddleware } from '../common/middleware/upload.middleware.js';
import { dedupeKey, enqueue, type QueuedJob } from '../services/queue/index.js';
import { assertBudgetLeft } from '../services/quota/index.js';
import { initSessionModule, sessionIdOf } from './session/index.js';
import { initNotebooksModule } from './notebooks/index.js';
import { initSourcesModule } from './sources/index.js';
import { initChatModule } from './chat/index.js';
import { budgetMiddleware, chatDeps, loadMessages } from '../wiring/chat.js';
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

  // The one place that knows about more than one module. Notebooks answers
  // "may this session write here", sources asks it, and neither imports the
  // other: the answer is handed over as a function.
  const llm = new AnthropicLlmAdapter();

  try {
    const notebooks = initNotebooksModule(app, { prisma, sessionIdOf });
    startupStatus.moduleOk('Notebooks');

    initSourcesModule(app, {
      prisma,
      sessionIdOf,
      notebooks: {
        writable: async (notebookId, sessionId) =>
          notebooks.service.writable(notebookId, sessionId),
        readable: async (notebookId, sessionId) =>
          notebooks.service.readable(notebookId, sessionId),
      },
      tokens: {
        // One source, counted as the API counts it. The notebook's total is
        // the sum of these, kept as an increment on the row; counting the
        // whole notebook again on every upload would cost a request the size
        // of the notebook for a number that only moved by one document.
        countTextTokens: async (title, text) =>
          llm.countTokens(
            buildCountTokensRequest({
              model: models.chat,
              sources: [{ id: 'pending', position: 1, title, kind: 'paste', text }],
            })
          ),
      },
      limits: {
        maxSources: env.MAX_SOURCES_PER_NOTEBOOK,
        maxTokens: env.MAX_TOKENS_PER_NOTEBOOK,
      },
      // The job id is (notebook, type, params), so the same source is queued
      // once however often the route is called. The worker picks it up from
      // here; the API process never waits for it (ADR-0009).
      enqueueIngest: ({ sourceId, notebookId }) =>
        enqueue('ingest', dedupeKey(notebookId, 'ingest', sourceId), {
          kind: 'ingest',
          sourceId,
          notebookId,
        } satisfies QueuedJob),
      upload: createUploadMiddleware(),
      // 20 per hour and session (SECURITY.md 7.3). The general limiter above is
      // per address and is the outer bound; this one is the one the spec names.
      limit: createRateLimiter('sources', config.rateLimit.sources),
      // M2 opened the path that spends money; the cap that stops it belonged to
      // M7 and was a stub that threw. The check is one aggregate over
      // usage_log, so it goes in now rather than after the first bill.
      assertBudgetLeft: () => assertBudgetLeft(),
    });
    startupStatus.moduleOk('Sources');
  } catch (error) {
    startupStatus.moduleFail('Notebooks/Sources', error);
    throw error;
  }

  try {
    initChatModule(app, {
      sessionIdOf,
      limitPerSession: createRateLimiter('chat-session', config.rateLimit.chatPerSession),
      limitPerIp: createRateLimiter('chat-ip', config.rateLimit.chatPerIp),
      budget: budgetMiddleware(),
      loadMessages,
      ...chatDeps(llm),
    });
    startupStatus.moduleOk('Chat');
  } catch (error) {
    startupStatus.moduleFail('Chat', error);
    throw error;
  }

  // notes arrive in M5-T4, studio in M6-T1.

  logger.info('[Modules] All modules registered successfully');
  startupStatus.logSummary();
  return Promise.resolve();
}

export { globalEventEmitter };
