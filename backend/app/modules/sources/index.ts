/**
 * Sources. A source belongs to a notebook, a notebook to a session, and the
 * capacity gate stands in front of both (docs/SPEC.md, "Zahlen").
 */
import type { Express, Request, RequestHandler } from 'express';

import type { PrismaClient } from '../../lib/prisma.js';
import { SourcesController } from './controllers/sources.controller.js';
import { PrismaSourcesRepository } from './internal/prisma.repository.js';
import { createSourcesRouter } from './routes/sources.routes.js';
import { SourcesService, type SourceTokenCounter } from './services/sources.service.js';
import type { NotebookAccess } from './interfaces/sources.repository.js';

export interface SourcesModuleDeps {
  prisma: PrismaClient;
  sessionIdOf: (req: Request) => string | null;
  /** Answered by the notebooks module, handed over in modules/index.ts. */
  notebooks: NotebookAccess;
  tokens: SourceTokenCounter;
  limits: { maxSources: number; maxTokens: number };
  upload: RequestHandler;
  basePath?: string;
}

export function initSourcesModule(app: Express, deps: SourcesModuleDeps): void {
  const repository = new PrismaSourcesRepository(deps.prisma);
  const service = new SourcesService({
    repository,
    notebooks: deps.notebooks,
    tokens: deps.tokens,
    limits: deps.limits,
  });
  const controller = new SourcesController(service, deps.sessionIdOf);

  app.use(deps.basePath ?? '/api', createSourcesRouter({ controller, upload: deps.upload }));
}

export { SourcesService } from './services/sources.service.js';
export type { SourceTokenCounter } from './services/sources.service.js';
export { SourcesController } from './controllers/sources.controller.js';
export { createSourcesRouter } from './routes/sources.routes.js';
export { checkCapacity } from './internal/capacity.js';
export type { CapacityLimits, CapacityRefusal, NotebookCapacity } from './internal/capacity.js';
export { CapacityExceededError, EmptySourceError, UnsupportedSourceError } from './internal/errors.js';
export type {
  NotebookAccess,
  SourceRow,
  SourcesRepository,
} from './interfaces/sources.repository.js';
