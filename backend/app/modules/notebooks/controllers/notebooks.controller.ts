/**
 * Parses, calls the service, shapes the answer. No business rules live here.
 */
import type { Request, Response } from 'express';

import {
  createNotebookSchema,
  notebookIdSchema,
  toNotebookResponse,
} from '../dto/notebook.dto.js';
import { NoSessionError } from '../internal/errors.js';
import type { NotebooksService } from '../services/notebooks.service.js';

/**
 * The session is handed in as a function rather than read from `req` directly,
 * so this module never learns that express-session exists. modules/index.ts
 * injects the session module's own reader.
 */
export type SessionIdReader = (req: Request) => string | null;

export class NotebooksController {
  constructor(
    private readonly service: NotebooksService,
    private readonly sessionIdOf: SessionIdReader
  ) {}

  private requireSession(req: Request): string {
    const sessionId = this.sessionIdOf(req);
    if (!sessionId) throw new NoSessionError();
    return sessionId;
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { title } = createNotebookSchema.parse(req.body ?? {});

    const notebook = await this.service.create(sessionId, title);
    res.status(201).json(toNotebookResponse(notebook));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const notebooks = await this.service.list(sessionId);
    res.json({ notebooks: notebooks.map(toNotebookResponse) });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { id } = notebookIdSchema.parse(req.params);

    const notebook = await this.service.readable(id, sessionId);
    // Reading counts as using it: the cleanup job measures exactly this
    // (M7-T5), so a notebook someone opens every day never expires.
    await this.service.touch(id);

    res.json(toNotebookResponse(notebook));
  };
}
