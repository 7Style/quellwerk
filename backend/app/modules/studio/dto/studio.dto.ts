/**
 * Input schemas and the shape a report takes on its way out.
 *
 * The focus is user data. It travels into the last user turn through the
 * renderer and never into the system block (CLAUDE.md); the length limit lives
 * here, in the route's schema, and not in the renderer.
 */
import { z } from 'zod';

import { REPORT_FORMATS } from '../internal/formats.js';
import type { ArtifactRow, ArtifactWithBody } from '../interfaces/studio.repository.js';

/** Long enough to describe a report, short enough not to be a document. */
export const MAX_FOCUS_CHARS = 1_000;

export const notebookIdParamSchema = z.object({
  notebookId: z.union([z.uuid(), z.literal('demo')], { error: 'Not a notebook id.' }),
});

export const artifactIdParamSchema = notebookIdParamSchema.extend({
  artifactId: z.uuid({ error: 'Not a report id.' }),
});

export const createReportSchema = z.object({
  format: z.enum(REPORT_FORMATS),
  focus: z.string().trim().max(MAX_FOCUS_CHARS).default(''),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export interface ReportResponse {
  id: string;
  /**
   * Das Notizbuch, in dem dieser Report liegt.
   *
   * Nicht immer das, an das die Anfrage ging: ein Report, der im
   * Demo-Notizbuch bestellt wird, entsteht in einer Kopie, die der eigenen
   * Sitzung gehört (Copy-on-first-write, M7-T1). Die Oberfläche vergleicht die
   * Id mit der Adresse und wechselt, wenn sie abweicht.
   */
  notebookId: string;
  type: string;
  format: string;
  focus: string;
  title: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export function toReportResponse(row: ArtifactRow): ReportResponse {
  return {
    id: row.id,
    notebookId: row.notebookId,
    type: row.type,
    format: row.params?.format ?? 'briefing',
    focus: row.params?.focus ?? '',
    title: row.title,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export interface ReportBodyResponse extends ReportResponse {
  segments: Array<{ text: string; citations: unknown[] }>;
  /** The rendered prompt, for "View prompt used" (docs/SPEC.md). */
  promptUsed: string | null;
}

export function toReportBodyResponse(row: ArtifactWithBody): ReportBodyResponse {
  return {
    ...toReportResponse(row),
    segments: Array.isArray(row.segments)
      ? (row.segments as Array<{ text: string; citations: unknown[] }>)
      : [],
    promptUsed: row.promptUsed,
  };
}

/* -------------------------------------------------------------------------- */
/* Mind map                                                                    */
/* -------------------------------------------------------------------------- */

export interface MindMapNodeResponse {
  id: string;
  label: string;
  parentId: string | null;
  depth: number;
}

export interface MindMapResponse {
  id: string;
  notebookId: string;
  status: string;
  error: string | null;
  /** Leer, solange die Karte geschrieben wird. */
  nodes: MindMapNodeResponse[];
  createdAt: string;
  finishedAt: string | null;
}

/**
 * Die Knoten kommen aus der Json-Spalte, also wird hier einmal verengt.
 *
 * Was nicht wie ein Knoten aussieht, faellt weg statt als halber Knoten in die
 * Zeichnung zu geraten - dieselbe Regel wie bei den Segmenten einer Notiz.
 */
export function toMindMapResponse(row: ArtifactRow & { data?: unknown }): MindMapResponse {
  return {
    id: row.id,
    notebookId: row.notebookId,
    status: row.status,
    error: row.error,
    nodes: asNodes(row.data),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function asNodes(value: unknown): MindMapNodeResponse[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (one): one is MindMapNodeResponse =>
      typeof one === 'object' &&
      one !== null &&
      typeof (one as MindMapNodeResponse).id === 'string' &&
      typeof (one as MindMapNodeResponse).label === 'string' &&
      typeof (one as MindMapNodeResponse).depth === 'number'
  );
}

/* -------------------------------------------------------------------------- */
/* Flashcards                                                                  */
/* -------------------------------------------------------------------------- */

export interface FlashcardResponse {
  question: string;
  /** Die Rueckseite als Segmente, damit sie derselbe Renderer zeichnet. */
  answer: Array<{ text: string; citations: unknown[] }>;
}

export interface FlashcardsResponse {
  id: string;
  notebookId: string;
  status: string;
  error: string | null;
  cards: FlashcardResponse[];
  createdAt: string;
  finishedAt: string | null;
}

export function toFlashcardsResponse(row: ArtifactRow & { data?: unknown }): FlashcardsResponse {
  return {
    id: row.id,
    notebookId: row.notebookId,
    status: row.status,
    error: row.error,
    cards: asCards(row.data),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Was nicht wie eine Karte aussieht, faellt weg statt halb gezeichnet zu werden. */
function asCards(value: unknown): FlashcardResponse[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (one): one is FlashcardResponse =>
      typeof one === 'object' &&
      one !== null &&
      typeof (one as FlashcardResponse).question === 'string' &&
      Array.isArray((one as FlashcardResponse).answer)
  );
}
