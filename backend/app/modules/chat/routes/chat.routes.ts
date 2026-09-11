/**
 * The chat route. One POST, one event stream.
 *
 * Two limiters in front of it, both from SECURITY.md 7.3: 30 turns per hour and
 * session, 60 per hour and address. The second is the outer bound for a network
 * where many sessions share one address, and it is the one that still holds when
 * somebody throws the cookie away.
 */
import { Router, type RequestHandler } from 'express';

import type { ChatController } from '../controllers/chat.controller.js';

function wrap(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export interface ChatRouterDeps {
  controller: ChatController;
  /** 30 per hour and session. */
  limitPerSession: RequestHandler;
  /** 60 per hour and address. */
  limitPerIp: RequestHandler;
  /** Refuses with 503 once the daily budget is spent. */
  budget: RequestHandler;
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post(
    '/notebooks/:notebookId/chat',
    // In this order on purpose: the cheapest refusal first. A caller over the
    // rate limit never reaches the budget query, and neither of them ever
    // reaches the model.
    deps.limitPerIp,
    deps.limitPerSession,
    deps.budget,
    wrap(deps.controller.ask)
  );

  return router;
}
