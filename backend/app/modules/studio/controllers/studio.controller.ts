/**
 * Parses, calls the service, shapes the answer.
 */
import type { Request, Response } from 'express';

import {
  artifactIdParamSchema,
  createReportSchema,
  notebookIdParamSchema,
  toReportBodyResponse,
  toReportResponse,
} from '../dto/studio.dto.js';
import type { StudioService } from '../services/studio.service.js';

export type SessionIdReader = (req: Request) => string | null;

export class StudioController {
  constructor(
    private readonly service: StudioService,
    private readonly sessionIdOf: SessionIdReader
  ) {}

  private requireSession(req: Request): string {
    const sessionId = this.sessionIdOf(req);
    if (!sessionId) {
      // Declared locally, not imported: modules do not import each other.
      throw Object.assign(new Error('No session. Enable cookies and reload.'), {
        statusCode: 400,
        errorCode: 'NO_SESSION',
      });
    }
    return sessionId;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId } = notebookIdParamSchema.parse(req.params);

    const reports = await this.service.list(notebookId, sessionId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ reports: reports.map(toReportResponse) });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId, artifactId } = artifactIdParamSchema.parse(req.params);

    const report = await this.service.get(notebookId, artifactId, sessionId);
    // The body carries the report and the prompt that produced it. Both belong
    // to one session's notebook; a shared cache in front of this would be a
    // cache of somebody's documents keyed by a URL that does not say whose.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ report: toReportBodyResponse(report) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId } = notebookIdParamSchema.parse(req.params);
    const input = createReportSchema.parse(req.body ?? {});

    const { artifact, created } = await this.service.request(notebookId, sessionId, input);

    // 201 for a report that was just asked for, 200 for one that already
    // existed. The client draws the same thing either way; the difference is
    // what it means, and a route that says 201 twice for one report is a route
    // that will be believed the second time.
    res.status(created ? 201 : 200).json({ report: toReportResponse(artifact) });
  };

  retry = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId, artifactId } = artifactIdParamSchema.parse(req.params);

    const artifact = await this.service.retry(notebookId, artifactId, sessionId);
    res.json({ report: toReportResponse(artifact) });
  };
}
