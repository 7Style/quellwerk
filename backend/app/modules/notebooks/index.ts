/**
 * Notebooks. A notebook belongs to the anonymous session that created it
 * (ADR-0005); a notebook of a different session answers 404 and never 403, so
 * a guessed id is not confirmed (SECURITY.md 7.2).
 */
import type { Express, Request } from 'express';

import type { PrismaClient } from '../../lib/prisma.js';
import { NotebooksController } from './controllers/notebooks.controller.js';
import { PrismaNotebooksRepository } from './internal/prisma.repository.js';
import { createNotebooksRouter } from './routes/notebooks.routes.js';
import { NotebooksService } from './services/notebooks.service.js';

export interface NotebooksModuleDeps {
  prisma: PrismaClient;
  /** The session module's own reader, injected so this module never imports it. */
  sessionIdOf: (req: Request) => string | null;
  /** Where the routes are mounted. `/api`, because the vhost proxies that prefix. */
  basePath?: string;
}

export interface NotebooksModule {
  /**
   * Handed to other modules that need to know whether a session may use a
   * notebook. They get a function, not the service, so nothing else can reach
   * the repository through it.
   */
  service: NotebooksService;
}

export function initNotebooksModule(app: Express, deps: NotebooksModuleDeps): NotebooksModule {
  const repository = new PrismaNotebooksRepository(deps.prisma);
  const service = new NotebooksService({ repository });
  const controller = new NotebooksController(service, deps.sessionIdOf);

  app.use(deps.basePath ?? '/api', createNotebooksRouter(controller));

  return { service };
}

export { NotebooksService } from './services/notebooks.service.js';
export { NotebooksController } from './controllers/notebooks.controller.js';
export { createNotebooksRouter } from './routes/notebooks.routes.js';
export { NotebookNotFoundError, NoSessionError } from './internal/errors.js';
export type { NotebookRow, NotebooksRepository } from './interfaces/notebooks.repository.js';
