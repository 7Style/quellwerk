/**
 * Eingabeschemata und die Form, die eine Notiz nach außen hat.
 *
 * Titel und Text sind vom Leser getippt und damit Daten (CLAUDE.md). Sie gehen
 * in kein Prompt-Fragment, sondern in eine Zeile; wird die Notiz später eine
 * Quelle, geht sie denselben Weg wie eingefügter Text und landet in einem
 * Dokumentblock. Die Längen stehen hier, im Schema der Route, und nirgends
 * sonst.
 */
import { z } from 'zod';

import type { NoteRow } from '../interfaces/notes.repository.js';

/** So lang wie eine eingefügte Quelle: eine Notiz kann eine werden. */
export const MAX_NOTE_CHARS = 200_000;
export const MAX_TITLE_CHARS = 200;

export const notebookIdParamSchema = z.object({
  notebookId: z.union([z.uuid(), z.literal('demo')], { error: 'Not a notebook id.' }),
});

export const noteIdParamSchema = notebookIdParamSchema.extend({
  noteId: z.uuid({ error: 'Not a note id.' }),
});

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'A note needs a title.').max(MAX_TITLE_CHARS),
  markdown: z.string().min(1, 'A note needs text.').max(MAX_NOTE_CHARS),
});

export const saveAnswerSchema = z.object({
  /**
   * Die Antwort, die gesichert wird - nicht ihre Belege.
   *
   * Der Server liest die geprüften Segmente aus der gespeicherten Nachricht.
   * Ein Client, der sie mitschickte, könnte Chips ablegen, die nie ein Resolver
   * nachgerechnet hat, und eine Notiz zeichnet sie wie eine Antwort.
   */
  messageId: z.uuid({ error: 'Not a message id.' }),
  title: z.string().trim().min(1, 'A note needs a title.').max(MAX_TITLE_CHARS),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export interface NoteResponse {
  id: string;
  /** Nicht immer das Notizbuch, an das die Anfrage ging (Copy-on-first-write). */
  notebookId: string;
  title: string;
  markdown: string;
  /** Die geprüften Segmente einer gesicherten Antwort, oder null. */
  segments: NoteRow['segments'];
  fromMessageId: string | null;
  createdAt: string;
}

export function toNoteResponse(row: NoteRow): NoteResponse {
  return {
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    markdown: row.markdown,
    segments: row.segments,
    fromMessageId: row.fromMessageId,
    createdAt: row.createdAt.toISOString(),
  };
}
