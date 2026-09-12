/**
 * Everything that arrives from a client is parsed here first.
 *
 * A title is user data. It reaches a model only as a field of a document block
 * or inside the last user turn, never in the system prompt (CLAUDE.md), and the
 * length limit lives in this schema rather than in the prompt renderer.
 */
import { z } from 'zod';

import type { NotebookRow } from '../interfaces/notebooks.repository.js';

/** NotebookLM calls a fresh notebook this; the UI vocabulary is English (docs/SPEC.md). */
export const DEFAULT_NOTEBOOK_TITLE = 'Untitled notebook';

export const createNotebookSchema = z.object({
  // A title of twenty spaces is no title. `.trim().min(1)` alone would refuse
  // it with 400, which is technically right and unhelpful: the client sent a
  // field it simply left blank. Emptying it first makes it the same case as
  // sending nothing, and that case has an answer.
  title: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(120).default(DEFAULT_NOTEBOOK_TITLE)
  ),
});

export type CreateNotebookInput = z.infer<typeof createNotebookSchema>;

/**
 * The demo notebook carries the fixed id `demo` (M2-T5), so a notebook id is a
 * uuid or that one word. Without the exception `/n/demo` answers 400 and the
 * link everybody is given is the one link that does not work.
 */
export const DEMO_NOTEBOOK_ID = 'demo';

const notebookId = z.union([z.uuid(), z.literal(DEMO_NOTEBOOK_ID)], {
  error: 'Not a notebook id.',
});

export const notebookIdSchema = z.object({ id: notebookId });

/**
 * What a notebook looks like on the wire.
 *
 * `sessionId` is deliberately not in it. It is the one field that says who owns
 * the row, and a client that never sees an id cannot try someone else's.
 */
export interface NotebookResponse {
  id: string;
  title: string;
  emoji: string | null;
  summary: string | null;
  suggestedQuestions: unknown;
  tokenCount: number;
  sourceCount: number;
  isDemo: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export function toNotebookResponse(row: NotebookRow): NotebookResponse {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    summary: row.summary,
    suggestedQuestions: row.suggestedQuestions ?? null,
    tokenCount: row.tokenCount,
    sourceCount: row.sourceCount,
    isDemo: row.isDemo,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}
