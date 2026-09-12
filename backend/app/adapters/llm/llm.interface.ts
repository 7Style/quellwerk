/**
 * The only shape the application knows about a model provider. Everything that
 * touches the Anthropic API lives behind this (ADR-0004); type-only imports
 * from the SDK are allowed anywhere, instantiating the client is not.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { ArtifactRequest } from './artifact-request.js';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  stopReason: string | null;
  requestId: string | null;
  latencyMs: number;
}

/**
 * What a streamed turn looks like to the application.
 *
 * Deliberately not the SDK's events. A module that read `content_block_delta`
 * would carry Anthropic's vocabulary into the business rules and would have to
 * be touched whenever the SDK's shape changes (ADR-0004).
 *
 * `segment` is the ordinal of the text block, counted past thinking blocks, so
 * it is the same number the client uses to attach a citation to a paragraph.
 */
export type LlmStreamEvent =
  | { type: 'segment'; segment: number }
  | { type: 'text'; segment: number; text: string }
  | { type: 'citation'; segment: number; citation: Anthropic.TextCitation }
  /**
   * What the first frame of the stream already knows: how much was read.
   *
   * `message_start` carries the input, cache read and cache write counts before
   * a single token of the answer exists, because the prefix is fixed by then.
   * The expensive half of a turn is therefore known from its first moment, and
   * a turn that is abandoned can still be billed for what it actually cost.
   */
  | { type: 'started'; usage: Anthropic.MessageStartEvent['message']['usage'] }
  | { type: 'done'; message: Anthropic.Message };

export interface ILlmProvider {
  /** Chat and reports: citations on, text out. `signal` aborts the upstream call. */
  streamChat(
    request: Anthropic.MessageCreateParamsStreaming,
    signal?: AbortSignal
  ): AsyncIterable<LlmStreamEvent>;
  /**
   * Structured outputs: citations off, JSON out. The request comes from
   * `buildArtifactRequest`, whose type is derived from what the SDK's `parse`
   * accepts, so an output format cannot be handed to the wrong method.
   */
  parseArtifact<T>(request: ArtifactRequest): Promise<{ parsed: T; usage: LlmUsage }>;
  /**
   * Input tokens for a request, as the API counts them.
   *
   * The 150,000 token cap is enforced against this number and not against an
   * estimate (docs/SPEC.md): the same characters tokenise differently in dense
   * legal text than in prose, and the difference decides whether a source is
   * accepted. The endpoint is free and has its own rate limit, separate from
   * message creation, so calling it on every upload is affordable.
   */
  countTokens(request: Anthropic.MessageCountTokensParams): Promise<number>;
}
