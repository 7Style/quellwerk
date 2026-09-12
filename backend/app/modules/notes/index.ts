/**
 * Notizen. Was im Studio neben den Reports steht: eine gesicherte Antwort mit
 * ihren Belegen, ein eigener Text, und der Weg von einer Notiz zu einer Quelle.
 */
import type { Express, Request, RequestHandler } from 'express';

import type { PrismaClient } from '../../lib/prisma.js';
import { NotesController } from './controllers/notes.controller.js';
import { PrismaNotesRepository } from './internal/prisma.repository.js';
import { createNotesRouter } from './routes/notes.routes.js';
import { NotesService } from './services/notes.service.js';
import type {
  CreateSourceFromText,
  LoadMessageSegments,
  NotebookAccess,
} from './interfaces/notes.repository.js';

export interface NotesModuleDeps {
  prisma: PrismaClient;
  sessionIdOf: (req: Request) => string | null;
  notebooks: NotebookAccess;
  /** Aus dem Chat-Modul, über die Kompositionswurzel: die geprüften Segmente. */
  loadMessageSegments: LoadMessageSegments;
  /** Aus dem Quellen-Modul, über dieselbe Wurzel: derselbe Weg wie Einfügen. */
  createSourceFromText: CreateSourceFromText;
  limit: RequestHandler;
  basePath?: string;
}

export function initNotesModule(app: Express, deps: NotesModuleDeps): void {
  const service = new NotesService({
    repository: new PrismaNotesRepository(deps.prisma),
    notebooks: deps.notebooks,
    loadMessageSegments: deps.loadMessageSegments,
    createSourceFromText: deps.createSourceFromText,
  });
  const controller = new NotesController(service, deps.sessionIdOf);

  app.use(deps.basePath ?? '/api', createNotesRouter({ controller, limit: deps.limit }));
}

export { NotesService } from './services/notes.service.js';
export { NotesController } from './controllers/notes.controller.js';
export { createNotesRouter } from './routes/notes.routes.js';
export { PrismaNotesRepository } from './internal/prisma.repository.js';
export { toNoteResponse, MAX_NOTE_CHARS, MAX_TITLE_CHARS } from './dto/note.dto.js';
export type { NoteResponse } from './dto/note.dto.js';
export type {
  CreateNoteData,
  CreateSourceFromText,
  LoadMessageSegments,
  NoteRow,
  NoteSegment,
  NotebookAccess,
  NotesRepository,
} from './interfaces/notes.repository.js';
