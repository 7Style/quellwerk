/**
 * Input schemas for sources.
 *
 * A title and pasted text are user data. They travel into a document block or
 * the last user turn and never into the system prompt (CLAUDE.md); the length
 * limits belong here, in the route's schema, and not in the prompt renderer.
 */
import { z } from 'zod';

import type { SourceRow } from '../interfaces/sources.repository.js';

/** The kinds the product accepts. Website sources are cut (docs/KNOWN-LIMITS.md). */
export const SOURCE_KINDS = ['pdf', 'txt', 'md', 'docx', 'paste'] as const;

/**
 * Pasted text is capped at characters, not tokens: the number has to be
 * checkable before anything is measured, and a megabyte of text in a JSON body
 * is a different problem from a notebook that is too large. The token cap still
 * applies afterwards, on the real count.
 */
export const MAX_PASTE_CHARS = 1_000_000;

export const createPastedSourceSchema = z.object({
  kind: z.literal('paste'),
  title: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(MAX_PASTE_CHARS),
});

export type CreatePastedSourceInput = z.infer<typeof createPastedSourceSchema>;

/** Mirrors the notebooks module: a uuid, or the demo notebook's fixed id. */
export const notebookIdParamSchema = z.object({
  notebookId: z.union([z.uuid(), z.literal('demo')], { error: 'Not a notebook id.' }),
});

export interface SourceResponse {
  id: string;
  position: number;
  title: string;
  kind: string;
  status: string;
  step: string | null;
  error: string | null;
  charCount: number;
  tokenCount: number;
  createdAt: string;
}

/**
 * The stored text is never in the response. The viewer asks for it by id when
 * it needs it; putting it into every list would send a megabyte to draw a row
 * of titles.
 */
export function toSourceResponse(row: SourceRow): SourceResponse {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    kind: row.kind,
    status: row.status,
    step: row.step,
    error: row.error,
    charCount: row.charCount,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt.toISOString(),
  };
}
