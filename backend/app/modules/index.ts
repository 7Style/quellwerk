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
import {
  dedupeKey,
  enqueue,
  enqueueReplacing,
  type ArtifactJob,
  type QueuedJob,
} from '../services/queue/index.js';
import { assertBudgetLeft } from '../services/quota/index.js';
import { initSessionModule, sessionIdOf } from './session/index.js';
import { initNotebooksModule } from './notebooks/index.js';
import { initSourcesModule, type SourcesModule } from './sources/index.js';
import { initChatModule } from './chat/index.js';
import { initStudioModule } from './studio/index.js';
import { initNotesModule } from './notes/index.js';
import { budgetMiddleware, chatDeps, loadMessages, loadMessageSegments } from '../wiring/chat.js';
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

  // Out of the try below, because two modules ask it the ownership question:
  // sources and studio. A failure here is fatal either way - the catch rethrows
  // - so nothing is lost by mounting it first.
  const notebooks = initNotebooksModule(app, { prisma, sessionIdOf });
  startupStatus.moduleOk('Notebooks');

  // Ausserhalb des try, weil das Notizen-Modul weiter unten den Dienst braucht:
  // "Convert to source" geht denselben Weg wie eingefuegter Text. Der catch
  // wirft weiter, also ist die Variable danach in jedem Fall gesetzt.
  let sources: SourcesModule;

  try {
    sources = initSourcesModule(app, {
      prisma,
      sessionIdOf,
      notebooks: {
        // Eine neue Quelle darf das Demo-Notizbuch kopieren; genau dafür ist
        // Copy-on-first-write da (M7-T1).
        writableOrCopy: async (notebookId, sessionId) =>
          notebooks.service.writableOrCopy(notebookId, sessionId),
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

  try {
    initStudioModule(app, {
      prisma,
      sessionIdOf,
      notebooks: {
        readable: async (notebookId, sessionId) =>
          notebooks.service.readable(notebookId, sessionId),
        // Ein bestellter Report darf das Demo-Notizbuch kopieren, ein
        // "nochmal versuchen" nicht: es braucht die Zeile, die es dort nicht
        // gibt (M7-T1).
        writableOrCopy: async (notebookId, sessionId) =>
          notebooks.service.writableOrCopy(notebookId, sessionId),
        writable: async (notebookId, sessionId) =>
          notebooks.service.writable(notebookId, sessionId),
      },
      assertBudgetLeft: () => assertBudgetLeft(),
      // The API never waits for a report; the worker writes it (ADR-0009).
      // One job id per (notebook, report, key), so a second enqueue for a
      // report already queued is dropped by BullMQ rather than run twice.
      enqueueArtifact: ({ artifactId, notebookId, kind, replace }) => {
        const jobId = dedupeKey(notebookId, kind, artifactId);
        const data = { kind, artifactId, notebookId } satisfies ArtifactJob;
        // "Try again" has to get past the finished job that still holds the id;
        // a first ask must not (that is the dedupe).
        return replace
          ? enqueueReplacing('artifact', jobId, data)
          : enqueue('artifact', jobId, data);
      },
      // A report is the most expensive call in the product, and it has its own
      // ceiling for that reason (SECURITY.md 7.3). Its own bucket, too: on the
      // sources limiter, twenty uploads would block every report for the rest
      // of the hour.
      limit: createRateLimiter('artifacts', config.rateLimit.artifacts),
    });
    startupStatus.moduleOk('Studio');
  } catch (error) {
    startupStatus.moduleFail('Studio', error);
    throw error;
  }

  try {
    initNotesModule(app, {
      prisma,
      sessionIdOf,
      notebooks: {
        readable: async (notebookId, sessionId) =>
          notebooks.service.readable(notebookId, sessionId),
        // Eine Notiz ist ein Schreibzugriff, der etwas anlegt, also darf sie
        // das Demo-Notizbuch kopieren (M7-T1).
        writableOrCopy: async (notebookId, sessionId) =>
          notebooks.service.writableOrCopy(notebookId, sessionId),
      },
      // Die beiden Stellen, an denen das Notizen-Modul etwas von zwei anderen
      // braucht, ohne sie zu importieren: die geprueften Segmente einer Antwort
      // aus dem Chat, und der Weg, den eingefuegter Text nimmt, aus den
      // Quellen. Beides wird hier uebergeben und nirgends sonst.
      loadMessageSegments,
      createSourceFromText: async ({ notebookId, sessionId, title, text }) => {
        const source = await sources.service.addPasted(notebookId, sessionId, { title, text });
        return { id: source.id, notebookId: source.notebookId };
      },
      // Dieselbe Schranke wie fuer eine Quelle: "Convert to source" loest am
      // Ende den Guide im Worker aus, und eine Notiz darf so gross sein wie
      // eine eingefuegte Quelle (SECURITY.md 7.3).
      limit: createRateLimiter('sources', config.rateLimit.sources),
    });
    startupStatus.moduleOk('Notes');
  } catch (error) {
    startupStatus.moduleFail('Notes', error);
    throw error;
  }

  logger.info('[Modules] All modules registered successfully');
  startupStatus.logSummary();
  return Promise.resolve();
}

export { globalEventEmitter };
