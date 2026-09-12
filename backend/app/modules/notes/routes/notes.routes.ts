/**
 * Die Notizen-Routen: ein Lesen und vier Schreibzugriffe.
 *
 * Vor den Schreibzugriffen steht die Quellen-Schranke, weil "Convert to source"
 * am Ende einen Modellaufruf auslöst (den Guide im Worker) und weil eine Notiz
 * eine Zeile in fremder Größenordnung ist: bis 200.000 Zeichen. Das Lesen trägt
 * nichts - wer über der Schranke ist, darf ansehen, was schon geschrieben ist.
 */
import { Router, type RequestHandler } from 'express';

import type { NotesController } from '../controllers/notes.controller.js';

function wrap(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export interface NotesRouterDeps {
  controller: NotesController;
  limit: RequestHandler;
}

export function createNotesRouter(deps: NotesRouterDeps): Router {
  const router = Router();

  router.get('/notebooks/:notebookId/notes', wrap(deps.controller.list));
  router.post('/notebooks/:notebookId/notes', deps.limit, wrap(deps.controller.create));
  router.post('/notebooks/:notebookId/notes/from-message', deps.limit, wrap(deps.controller.saveAnswer));
  router.post(
    '/notebooks/:notebookId/notes/:noteId/convert',
    deps.limit,
    wrap(deps.controller.convert)
  );
  router.delete('/notebooks/:notebookId/notes/:noteId', wrap(deps.controller.remove));

  return router;
}
