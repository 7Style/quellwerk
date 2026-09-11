/**
 * The single place that creates the Anthropic client and calls the API
 * (ADR-0004). Type-only imports from the SDK are allowed everywhere; this file
 * is the only one that holds a client.
 *
 * The streaming and structured-output paths arrive with the routes that need
 * them (M2-T2 and M3-T3). Token counting is here already, because the capacity
 * gate in M2-T1 refuses a source against a measured number rather than an
 * estimated one.
 */
import Anthropic from '@anthropic-ai/sdk';

import { env } from '../../config/env.config.js';
import type { ArtifactRequest } from './artifact-request.js';
import type { ILlmProvider, LlmUsage } from './llm.interface.js';
import { usageFrom } from './usage.js';

export class AnthropicLlmAdapter implements ILlmProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY) {
    // maxRetries 4 (SECURITY.md 7.1). The SDK retries connection errors, 408,
    // 409, 429 and 5xx with exponential backoff and honours Retry-After; the
    // one call that must not inherit it is the chat stream, where a retry would
    // replay tokens the user has already seen.
    this.client = new Anthropic({ apiKey, maxRetries: 4 });
  }

  streamChat(_request: Anthropic.MessageCreateParams): AsyncIterable<unknown> {
    throw new Error('AnthropicLlmAdapter.streamChat arrives in M3-T3');
  }

  /**
   * Structured output. Constrained decoding means the answer matches the schema
   * by construction, so there is no validation retry here: Anthropic states
   * that schema violations do not occur, and a retry loop around a guarantee is
   * a loop that only ever hides a different error.
   *
   * What can still go wrong is the answer being cut off at `max_tokens` before
   * the JSON closes. That surfaces as a missing `parsed_output`, and it is an
   * error rather than a half-written artifact.
   */
  async parseArtifact<T>(request: ArtifactRequest): Promise<{ parsed: T; usage: LlmUsage }> {
    const started = Date.now();
    const message = await this.client.messages.parse(request);
    const latencyMs = Date.now() - started;

    const parsed = message.parsed_output as T | null | undefined;
    if (parsed === null || parsed === undefined) {
      throw new Error(
        `the model returned no parseable output (stop_reason: ${message.stop_reason ?? 'unknown'})`
      );
    }

    return {
      parsed,
      usage: usageFrom(message.usage, {
        stopReason: message.stop_reason,
        requestId: message._request_id,
        latencyMs,
      }),
    };
  }

  /**
   * Returns `input_tokens` only. The endpoint reports nothing else, and a
   * number that pretends to include the answer would be the wrong one to
   * measure a notebook against.
   *
   * Nothing is written to `usage_log` here: counting is free and is not a model
   * call, so a row for it would put a zero-cost line next to real spend and
   * make the daily budget harder to read, not easier.
   */
  async countTokens(request: Anthropic.MessageCountTokensParams): Promise<number> {
    const response = await this.client.messages.countTokens(request);
    return response.input_tokens;
  }
}
