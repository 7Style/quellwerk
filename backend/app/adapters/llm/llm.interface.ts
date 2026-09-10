/**
 * The only shape the application knows about a model provider. Everything that
 * touches the Anthropic API lives behind this (ADR-0004); type-only imports
 * from the SDK are allowed anywhere, instantiating the client is not.
 */
import type Anthropic from '@anthropic-ai/sdk';

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
  /** Structured outputs: citations off, JSON out. */
  parseArtifact<T>(request: Anthropic.MessageCreateParams): Promise<{ parsed: T; usage: LlmUsage }>;
}
