/**
 * How many tokens a notebook costs, measured rather than estimated.
 *
 * The 150,000 token cap (docs/SPEC.md) is enforced against this number, so it
 * has to be the number the API would bill, not a character count divided by
 * four. A PDF whose text is full of short legal clauses tokenises differently
 * from prose, and the difference decides whether a source is accepted.
 *
 * Only the request is built here. The call itself belongs to
 * `AnthropicLlmAdapter`, the one place allowed to instantiate the client
 * (ADR-0004), which is why `countChatTokens` takes a provider instead of
 * reaching for one.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { buildDocuments, type DocumentSource } from './documents.js';

export interface CountTokensInput {
  model: string;
  /** The rendered system prompt, or nothing when only the documents are counted. */
  system?: string;
  sources: readonly DocumentSource[];
  /** Extra turns to include. The cap is measured on the documents alone. */
  messages?: readonly Anthropic.MessageParam[];
}

/**
 * Builds the request the count endpoint takes.
 *
 * Two things are deliberately absent. There is no `cache_control`: counting is
 * not a turn, and a breakpoint here would only be noise. And citations are off,
 * because whether the documents are citable does not change how they tokenise,
 * while leaving them on would tie this measurement to the chat builder's mode.
 */
export function buildCountTokensRequest(input: CountTokensInput): Anthropic.MessageCountTokensParams {
  const { blocks } = buildDocuments(input.sources, { citations: false });

  const content: Anthropic.ContentBlockParam[] = [...blocks];
  const messages: Anthropic.MessageParam[] = [
    ...(input.messages ?? []),
    // The endpoint needs at least one user turn. An empty notebook still has to
    // produce a number rather than an error, so the turn carries a single space
    // when there is nothing else; its own cost is constant and negligible.
    { role: 'user', content: content.length > 0 ? content : ' ' },
  ];

  const request: Anthropic.MessageCountTokensParams = {
    model: input.model,
    messages,
  };
  if (input.system) request.system = input.system;
  return request;
}

/** The part of a provider this file needs; the full interface is in llm.interface.ts. */
export interface TokenCounter {
  countTokens(request: Anthropic.MessageCountTokensParams): Promise<number>;
}

/**
 * The token count of a notebook's sources, as the API counts them.
 *
 * Used by the capacity gate when a source is added (M2-T1) and recorded on the
 * notebook as `tokenCount` together with the model it was measured on
 * (`tokenModel`): the same text counts differently on a different tokeniser,
 * so a number without its model is not a measurement.
 */
export async function countChatTokens(
  counter: TokenCounter,
  input: CountTokensInput
): Promise<number> {
  return counter.countTokens(buildCountTokensRequest(input));
}
