/**
 * Chat over the Citations API, with the check that makes a chip mean something.
 *
 * The module owns the turn: build the request, stream it, verify every citation
 * against the stored text, write the message and the usage rows. What it does
 * not own is where the sources come from or how a model is called; both are
 * injected in modules/index.ts.
 */
import type { Express, Request, RequestHandler } from 'express';

import { ChatController } from './controllers/chat.controller.js';
import { createChatRouter } from './routes/chat.routes.js';
import { ChatService, type ChatServiceDeps } from './services/chat.service.js';

export interface ChatModuleDeps extends ChatServiceDeps {
  sessionIdOf: (req: Request) => string | null;
  limitPerSession: RequestHandler;
  limitPerIp: RequestHandler;
  budget: RequestHandler;
  basePath?: string;
}

export function initChatModule(app: Express, deps: ChatModuleDeps): void {
  const service = new ChatService(deps);
  const controller = new ChatController(service, deps.sessionIdOf);

  app.use(
    deps.basePath ?? '/api',
    createChatRouter({
      controller,
      limitPerSession: deps.limitPerSession,
      limitPerIp: deps.limitPerIp,
      budget: deps.budget,
    })
  );
}

export { ChatService } from './services/chat.service.js';
export type { ChatServiceDeps, StreamEvent, TurnSources } from './services/chat.service.js';
export { resolveAnswer, resolveCitations, hasNoCitations } from './internal/citations.js';
export type { CitableSource, VerifiedCitation, DroppedCitation } from './internal/citations.js';
export { sseFrom, SseStream, errorEvent, eventsForStopReason } from './internal/stream.js';
export type { ChatEvent, TurnTrace, TurnUsage } from './internal/stream.js';
