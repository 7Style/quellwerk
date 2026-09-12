/**
 * Routes for sources, mounted under a notebook.
 *
 * The upload middleware is injected rather than built here: its limit is the
 * 20 MB cap from docs/SPEC.md, and a limit that a module configures for itself
 * is a limit that can differ from the one the documentation names.
 */
import { Router, type RequestHandler } from 'express';

import type { SourcesController } from '../controllers/sources.controller.js';

function wrap(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export interface SourcesRouterDeps {
  controller: SourcesController;
  /**
   * Accepts one optional file under the field `file`. Its size limit produces
   * a multer LIMIT_FILE_SIZE, which the error middleware turns into 413.
   */
  upload: RequestHandler;
  /**
   * 20 sources per hour and session (SECURITY.md 7.3). In front of `upload`,
   * so a caller over the limit is refused before 20 MB reach the disk, and in
   * front of the capacity gate, so being refused costs nothing to serve.
   */
  limit: RequestHandler;
}

export function createSourcesRouter(deps: SourcesRouterDeps): Router {
  const router = Router();

  router.post(
    '/notebooks/:notebookId/sources',
    deps.limit,
    deps.upload,
    wrap(deps.controller.create)
  );
  router.get('/notebooks/:notebookId/sources', wrap(deps.controller.list));
  // Not on the list response: sending every document to draw a row of titles
  // would be a megabyte for a sidebar. The viewer asks for one by id.
  router.get('/notebooks/:notebookId/sources/:sourceId/text', wrap(deps.controller.text));

  return router;
}
