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

export interface ILlmProvider {
  /** Chat and reports: citations on, text out. */
  streamChat(request: Anthropic.MessageCreateParams): AsyncIterable<unknown>;
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
