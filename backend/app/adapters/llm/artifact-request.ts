/**
 * The request builder for structured outputs: citations off, JSON out.
 *
 * There are two builders and not one because the API refuses the combination.
 * Anthropic states it plainly: enabling citations on a document block together
 * with `output_config.format` returns 400, "because citations require
 * interleaving citation blocks with text output, which is incompatible with the
 * strict JSON schema constraints of structured outputs". So an artifact cannot
 * carry chips, and a chat turn cannot return a typed object (ADR-0007).
 *
 * Layout of the request, and each part is a decision:
 *
 *   documents first, then the instructions, both in one user turn. The
 *   documents are the stable part; putting the instructions after them means a
 *   different artifact over the same sources still shares a prefix. And the
 *   prompts say "the document is in the message above this text", which is only
 *   true in this order.
 *
 *   no system block. The instructions are the whole task and they change per
 *   artifact; a system block would split the same text across two places.
 *
 *   at most a five minute cache breakpoint, never the one hour one. An artifact
 *   is written once; the hour-long cache belongs to the chat, whose documents
 *   are read again on every turn (prompts/README.md, cache rule 4).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

import { supportsEffort } from '../../config/models.js';
import { buildDocuments, type DocumentSource } from './documents.js';

/** What `client.messages.parse` takes. Derived, so it cannot drift from the SDK. */
export type ArtifactRequest = Parameters<Anthropic['messages']['parse']>[0];

/** The levels the API accepts, taken from the SDK rather than retyped here. */
export type EffortLevel = NonNullable<Anthropic.OutputConfig['effort']>;

export interface ArtifactRequestInput {
  model: string;
  /** The rendered prompt from prompts/, never an inline string (CLAUDE.md). */
  instructions: string;
  sources: readonly DocumentSource[];
  /**
   * The shape of the answer. It carries no length or count constraints: the API
   * strips them silently rather than honouring them, so "exactly four
   * questions" is checked in code after parsing (prompts/README.md).
   */
  schema: z.ZodType;
  maxTokens: number;
  /**
   * Only passed when the model accepts it. MODEL_FAST rejects
   * `output_config.effort` outright, and the loader must not default it in
   * when a prompt's front matter leaves it out (ADR-0011).
   */
  effort?: EffortLevel;
  /**
   * A five minute breakpoint on the last document block. Worth it when a second
   * call over the same documents follows within minutes, which is what the one
   * validation retry and the title-then-overview pair look like. Below the
   * model's minimum cacheable prefix it does nothing, silently, and that is not
   * a failure to assert on (prompts/README.md, cache rule 7).
   */
  cache5m?: boolean;
}

export function buildArtifactRequest(input: ArtifactRequestInput): ArtifactRequest {
  const { blocks } = buildDocuments(input.sources, {
    // Off, always. This is the half of the contract that makes the two builders
    // necessary in the first place.
    citations: false,
    cacheControl: input.cache5m ? { type: 'ephemeral' } : null,
  });

  const content: Anthropic.ContentBlockParam[] = [
    ...blocks,
    { type: 'text', text: input.instructions },
  ];

  const request: ArtifactRequest = {
    model: input.model,
    max_tokens: input.maxTokens,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(input.schema) },
  };

  if (input.effort && supportsEffort(input.model)) {
    request.output_config = { ...request.output_config, effort: input.effort };
  }

  return request;
}
