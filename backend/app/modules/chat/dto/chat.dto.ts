/**
 * Input for a chat turn.
 *
 * Every field here is typed by a stranger and goes to a model. None of it
 * reaches the system block: the question and the preferences are rendered into
 * the last user turn, which is both the security rule (CLAUDE.md) and the cache
 * rule (prompts/README.md, rule 3).
 */
import { z } from 'zod';

import { env } from '../../../config/env.config.js';

/**
 * Style and length are a closed set, not free text.
 *
 * They are rendered into the instructions of the turn, so an open field here
 * would be a second question with the authority of an instruction. The vocabulary
 * mirrors NotebookLM's Configure chat (docs/SPEC.md).
 */
export const CHAT_STYLES = ['Default', 'Analyst', 'Guide', 'Sceptic'] as const;
export const CHAT_LENGTHS = ['Default', 'Short', 'Long'] as const;

/**
 * Custom instructions ARE free text, deliberately: that is the feature. They
 * are capped, escaped by the renderer, and the prompt around them says what
 * they can and cannot change.
 */
const MAX_CUSTOM_INSTRUCTION_CHARS = 1_000;

export const chatTurnSchema = z.object({
  // The cap from docs/SPEC.md, "Zahlen": 4,000 characters per question,
  // enforced here and nowhere else.
  question: z.string().trim().min(1).max(env.MAX_QUESTION_CHARS),
  style: z.enum(CHAT_STYLES).optional(),
  length: z.enum(CHAT_LENGTHS).optional(),
  customInstructions: z.string().trim().max(MAX_CUSTOM_INSTRUCTION_CHARS).optional(),
});

export type ChatTurnInput = z.infer<typeof chatTurnSchema>;

/** Mirrors the other modules: a uuid, or the demo notebook's fixed id. */
export const notebookIdParamSchema = z.object({
  notebookId: z.union([z.uuid(), z.literal('demo')], { error: 'Not a notebook id.' }),
});
