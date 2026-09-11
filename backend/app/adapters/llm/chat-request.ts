/**
 * The request builder for the chat: citations on, text out.
 *
 * The other half of ADR-0007. Citations and structured outputs cannot be
 * combined - the API answers 400 - so an answer that carries chips cannot also
 * be a typed object, and the two builders never merge.
 *
 * Everything here is about one property: the prefix must be byte-identical
 * between two turns of the same notebook. System block, then every ready source
 * as a document block, then the conversation. Anything that changes per turn
 * goes after the last breakpoint, which is why the preferences live in the last
 * user turn and not in the system block (prompts/README.md, cache rule 3).
 *
 * A wrong breakpoint does not fail. It reads `cache_read_input_tokens: 0` and
 * quietly bills the documents again on every question; at 76,000 tokens that is
 * the difference between $0.04 and $0.78 a turn, measured.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { supportsEffort } from '../../config/models.js';
import { buildDocuments, type DocumentSource } from './documents.js';
import type { EffortLevel } from './artifact-request.js';

/** One earlier turn, replayed with the content blocks it originally had. */
export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  /**
   * Assistant turns are replayed with their original blocks: thinking blocks
   * with their signature, text blocks with their citations. `cited_text` that
   * comes back this way is not billed again (prompts/README.md, cache rule 5).
   */
  content: string | Anthropic.ContentBlockParam[];
}

export interface ChatRequestInput {
  model: string;
  /** The frozen system prompt. Byte-identical between turns or the cache misses. */
  system: string;
  /** Every ready source. There is no selection (docs/KNOWN-LIMITS.md). */
  sources: readonly DocumentSource[];
  /** Earlier turns, already trimmed to the cap by the caller. */
  history?: readonly ChatHistoryTurn[];
  /** The rendered `chat-preferences-tail`: preferences and the question. */
  tail: string;
  maxTokens: number;
  effort?: EffortLevel;
  /**
   * A second, five minute breakpoint on the last text block of the last
   * assistant turn, so a long conversation reads its history from cache too.
   * Off by default: below the model's minimum prefix it does nothing and a
   * breakpoint that does nothing still costs a slot.
   */
  cacheHistory?: boolean;
}

export interface BuiltChatRequest {
  request: Anthropic.MessageCreateParamsStreaming;
  /**
   * Position in this array is the `document_index` a citation carries. The
   * resolver maps through it; nothing may reorder the blocks afterwards.
   */
  sourceIds: string[];
}

/**
 * Thinking, so the UI has something to show before the first token of the
 * answer. `adaptive` lets the model decide how much it needs;
 * `display: summarized` is what the stream carries, and a summary is what the
 * Trace panel can show without putting raw reasoning in front of a reader.
 *
 * Never on MODEL_FAST: Haiku 4.5 refuses `{type: 'adaptive'}` with a 400 and
 * only accepts an explicit budget. The follow-up questions run there and carry
 * no thinking at all (ADR-0011).
 */
const THINKING: Anthropic.ThinkingConfigParam = { type: 'adaptive', display: 'summarized' };

/**
 * Puts a five minute breakpoint on the last TEXT block of the last assistant
 * turn.
 *
 * Not on a thinking block and not on a citation: neither can carry
 * `cache_control`, and the API rejects the request if one does. Returns the
 * history unchanged when there is no assistant turn ending in text, which is
 * the normal case for the first few turns.
 */
function withHistoryBreakpoint(
  history: readonly ChatHistoryTurn[]
): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role !== 'assistant' || typeof turn.content === 'string') continue;

    const blocks = [...turn.content];
    const lastText = blocks.findLastIndex((block) => block.type === 'text');
    if (lastText === -1) continue;

    // Narrowed rather than spread blindly, and the compiler is the one that
    // insisted: `cache_control` does not exist on a ThinkingBlockParam, so the
    // rule "never on a thinking block" is checked at build time and not only in
    // a comment.
    const textBlock = blocks[lastText];
    if (textBlock.type !== 'text') continue;

    blocks[lastText] = { ...textBlock, cache_control: { type: 'ephemeral' } };
    turns[index] = { ...turn, content: blocks };
    return turns;
  }

  return turns;
}

export function buildChatRequest(input: ChatRequestInput): BuiltChatRequest {
  const { blocks, sourceIds } = buildDocuments(input.sources, {
    // On. This is the builder whose answers carry chips.
    citations: true,
    // The one hour breakpoint, on the last document block and nowhere else. It
    // caches the system block and every document in front of it; a second
    // breakpoint on the system block would be a shorter TTL in front of a
    // longer one, which is the wrong order (prompts/README.md, cache rule 2).
    cacheControl: { type: 'ephemeral', ttl: '1h' },
  });

  const history = input.cacheHistory
    ? withHistoryBreakpoint(input.history ?? [])
    : (input.history ?? []).map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: Anthropic.MessageParam[] = [
    // The documents lead the first user turn, so they sit in the stable part of
    // the prefix. Everything that changes per turn comes after them.
    //
    // Omitted entirely when there are none: a turn with an empty content array
    // is a 400 from the API, and a notebook does exist before its first source.
    // The answer to a question there is a refusal, which is a good answer.
    ...(blocks.length > 0
      ? [{ role: 'user' as const, content: blocks }]
      : []),
    ...history,
    { role: 'user', content: input.tail },
  ];

  const request: Anthropic.MessageCreateParamsStreaming = {
    model: input.model,
    max_tokens: input.maxTokens,
    // Nothing on the system block. Its cache comes from the breakpoint on the
    // last document, which covers everything in front of it.
    system: [{ type: 'text', text: input.system }],
    messages,
    thinking: THINKING,
    stream: true,
  };

  if (input.effort && supportsEffort(input.model)) {
    request.output_config = { effort: input.effort };
  }

  return { request, sourceIds };
}
