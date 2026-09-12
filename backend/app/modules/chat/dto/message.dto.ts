/**
 * The shape a stored turn takes on its way to the browser.
 *
 * `refused` is computed here rather than stored. The route already owns the two
 * refusal sentences (`internal/refusal.ts`), it already enforces that a refusal
 * carries no citation, and a column would be a second place for the same fact
 * to be true in - one that a backfill could get wrong. Sending it as a field
 * also keeps the sentences out of the frontend, which would otherwise need a
 * third copy of them to draw a refusal differently from an answer.
 */
import { z } from 'zod';

import { beginsWithRefusal } from '../internal/refusal.js';
import type { VerifiedCitation } from '../internal/citations.js';

export const notebookIdParamSchema = z.object({
  notebookId: z.union([z.uuid(), z.literal('demo')], { error: 'Not a notebook id.' }),
});

export interface MessageSegment {
  text: string;
  citations: VerifiedCitation[];
}

export interface MessageResponse {
  id: string;
  role: 'user' | 'assistant';
  segments: MessageSegment[];
  droppedCitations: number;
  /** True when the answer opens with one of the two refusal sentences. */
  refused: boolean;
  createdAt: string;
}

/** What the route reads out of the table. */
export interface StoredMessage {
  id: string;
  role: string;
  segments: unknown;
  droppedCitations: number;
  createdAt: Date;
}

export function toMessageResponse(row: StoredMessage): MessageResponse {
  const segments = Array.isArray(row.segments) ? (row.segments as MessageSegment[]) : [];
  const role = row.role === 'assistant' ? 'assistant' : 'user';

  return {
    id: row.id,
    role,
    segments,
    droppedCitations: row.droppedCitations,
    // Joined with nothing between the segments, the way the answer was written:
    // the Citations API splits a sentence at its chips, so any separator here
    // would put characters into a sentence the model never wrote.
    refused: role === 'assistant' && beginsWithRefusal(segments.map((one) => one.text).join('')),
    createdAt: row.createdAt.toISOString(),
  };
}
