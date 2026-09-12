/**
 * Studio reports. A report is an answer nobody is sitting in front of: same
 * documents, same system block, same effort, written by a job (ADR-0009).
 */
import type { Express, Request, RequestHandler } from 'express';

import type { PrismaClient } from '../../lib/prisma.js';
import { StudioController } from './controllers/studio.controller.js';
import { PrismaStudioRepository } from './internal/prisma.repository.js';
import { createStudioRouter } from './routes/studio.routes.js';
import { StudioService } from './services/studio.service.js';
import type { NotebookAccess } from './interfaces/studio.repository.js';

export interface StudioModuleDeps {
  prisma: PrismaClient;
  sessionIdOf: (req: Request) => string | null;
  notebooks: NotebookAccess;
  assertBudgetLeft: () => Promise<void>;
  enqueueReport: (job: {
    artifactId: string;
    notebookId: string;
    replace?: boolean;
  }) => Promise<void>;
  limit: RequestHandler;
  basePath?: string;
}

export function initStudioModule(app: Express, deps: StudioModuleDeps): void {
  const service = new StudioService({
    repository: new PrismaStudioRepository(deps.prisma),
    notebooks: deps.notebooks,
    assertBudgetLeft: deps.assertBudgetLeft,
    enqueueReport: deps.enqueueReport,
  });
  const controller = new StudioController(service, deps.sessionIdOf);

  app.use(deps.basePath ?? '/api', createStudioRouter({ controller, limit: deps.limit }));
}

export { StudioService } from './services/studio.service.js';
export { StudioController } from './controllers/studio.controller.js';
export { createStudioRouter } from './routes/studio.routes.js';
export { PrismaStudioRepository } from './internal/prisma.repository.js';
export { FORMATS, REPORT_FORMATS, reportKey } from './internal/formats.js';
export type { FormatSpec, ReportFormat } from './internal/formats.js';
export { runReportJob } from './internal/report.job.js';
export type {
  ReportCitation,
  ReportDeps,
  ReportPayload,
  ReportResult,
  ReportRow,
  ReportSource,
  WrittenReport,
} from './internal/report.job.js';
export type {
  ArtifactRow,
  ArtifactWithBody,
  CreateArtifactData,
  NotebookAccess,
  StudioRepository,
} from './interfaces/studio.repository.js';
export { toReportResponse, toReportBodyResponse } from './dto/studio.dto.js';
export type { ReportBodyResponse, ReportResponse } from './dto/studio.dto.js';
