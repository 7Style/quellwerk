/**
 * Liest die Anfrage, ruft den Dienst, formt die Antwort.
 */
import type { Request, Response } from 'express';

import {
  createNoteSchema,
  notebookIdParamSchema,
  noteIdParamSchema,
  saveAnswerSchema,
  toNoteResponse,
} from '../dto/note.dto.js';
import type { NotesService } from '../services/notes.service.js';

export type SessionIdReader = (req: Request) => string | null;

export class NotesController {
  constructor(
    private readonly service: NotesService,
    private readonly sessionIdOf: SessionIdReader
  ) {}

  private requireSession(req: Request): string {
    const sessionId = this.sessionIdOf(req);
    if (!sessionId) {
      // Lokal geworfen, nicht importiert: Module importieren einander nicht.
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

    const notes = await this.service.list(notebookId, sessionId);
    // Eine Notiz gehört einem Notizbuch einer Sitzung; ein Zwischenspeicher
    // davor wäre ein Zwischenspeicher fremder Texte unter einer Adresse, der
    // nicht ansieht, wessen sie sind.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ notes: notes.map(toNoteResponse) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId } = notebookIdParamSchema.parse(req.params);
    const input = createNoteSchema.parse(req.body ?? {});

    const note = await this.service.create(notebookId, sessionId, input);
    res.status(201).json(toNoteResponse(note));
  };

  saveAnswer = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId } = notebookIdParamSchema.parse(req.params);
    const input = saveAnswerSchema.parse(req.body ?? {});

    const note = await this.service.saveAnswer(notebookId, sessionId, input);
    res.status(201).json(toNoteResponse(note));
  };

  convert = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId, noteId } = noteIdParamSchema.parse(req.params);

    const source = await this.service.convertToSource(notebookId, noteId, sessionId);
    res.status(201).json(source);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId, noteId } = noteIdParamSchema.parse(req.params);

    await this.service.remove(notebookId, noteId, sessionId);
    res.status(204).end();
  };
}
