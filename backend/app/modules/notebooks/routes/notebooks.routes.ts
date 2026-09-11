/**
 * Routes for notebooks. Mounted under /api by modules/index.ts.
 *
 * Every handler is wrapped: an async handler that rejects is a request that
 * hangs until the client gives up, and Express 5 forwards a rejected promise
 * only for handlers it can see returning one.
 */
import { Router, type RequestHandler } from 'express';

import type { NotebooksController } from '../controllers/notebooks.controller.js';

function wrap(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function createNotebooksRouter(controller: NotebooksController): Router {
  const router = Router();

  router.post('/notebooks', wrap(controller.create));
  router.get('/notebooks', wrap(controller.list));
  router.get('/notebooks/:id', wrap(controller.get));

  return router;
}
