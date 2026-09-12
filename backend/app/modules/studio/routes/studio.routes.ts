/**
 * The studio routes. Two reads and two writes.
 *
 * The writes carry the source limiter in front of them: a report is one model
 * call over the whole notebook, so the same per-session ceiling that guards
 * uploads guards these (SECURITY.md 7.3). The reads carry nothing - somebody
 * over the limit may still open what was already written.
 */
import { Router, type RequestHandler } from 'express';

import type { StudioController } from '../controllers/studio.controller.js';

function wrap(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export interface StudioRouterDeps {
  controller: StudioController;
  /** Per session and hour, in front of every request that can spend money. */
  limit: RequestHandler;
}

export function createStudioRouter(deps: StudioRouterDeps): Router {
  const router = Router();

  router.get('/notebooks/:notebookId/reports', wrap(deps.controller.list));
  router.get('/notebooks/:notebookId/reports/:artifactId', wrap(deps.controller.get));
  router.post('/notebooks/:notebookId/reports', deps.limit, wrap(deps.controller.create));
  router.post(
    '/notebooks/:notebookId/reports/:artifactId/retry',
    deps.limit,
    wrap(deps.controller.retry)
  );

  // Eine Karte je Notizbuch, deshalb Einzahl und kein Id-Segment. Der POST
  // schreibt sie neu, wenn es schon eine gibt: die Quellen aendern sich, die
  // Karte soll ihnen folgen.
  router.get('/notebooks/:notebookId/mindmap', wrap(deps.controller.mindMap));
  router.post('/notebooks/:notebookId/mindmap', deps.limit, wrap(deps.controller.createMindMap));

  return router;
}
