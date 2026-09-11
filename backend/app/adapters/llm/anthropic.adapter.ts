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
import type { ILlmProvider, LlmStreamEvent, LlmUsage } from './llm.interface.js';
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

  /**
   * Streams a chat turn and hands out events in our own shape.
   *
   * The caller never sees an SDK event. That is the whole point of the adapter:
   * `content_block_delta` with a `citations_delta` is Anthropic's vocabulary,
   * and a module that knew it would have to be changed when the SDK changes.
   *
   * `signal` aborts the upstream call. Without it a browser that closes the tab
   * leaves the request running to the end and the tokens are billed for an
   * answer nobody will read.
   */
  async *streamChat(
    request: Anthropic.MessageCreateParamsStreaming,
    signal?: AbortSignal
  ): AsyncIterable<LlmStreamEvent> {
    const stream = this.client.messages.stream(request, signal ? { signal } : undefined);

    // Segment index: the ordinal of the text block, not the content block. A
    // thinking block sits among them and must not shift the numbering the
    // client uses to attach a citation to a paragraph.
    const segmentOf = new Map<number, number>();
    let segments = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'text') {
        segmentOf.set(event.index, segments);
        yield { type: 'segment', segment: segments };
        segments += 1;
        continue;
      }

      if (event.type !== 'content_block_delta') continue;
      const segment = segmentOf.get(event.index);
      if (segment === undefined) continue;

      if (event.delta.type === 'text_delta') {
        yield { type: 'text', segment, text: event.delta.text };
      } else if (event.delta.type === 'citations_delta') {
        yield { type: 'citation', segment, citation: event.delta.citation };
      }
    }

    yield { type: 'done', message: await stream.finalMessage() };
  }

  /**
   * Runs a chat request to the end and returns the finished message.
   *
   * The same request, the same model, the same everything as `streamChat`; what
   * it does not do is hand out deltas. The eval wants the finished answer with
   * its citations, and a harness that reassembled deltas itself would be a
   * second implementation of the part that must not differ.
   */
  async streamToMessage(request: Anthropic.MessageCreateParamsStreaming): Promise<Anthropic.Message> {
    return this.client.messages.stream(request).finalMessage();
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
  async parseArtifact<T>(
    request: ArtifactRequest,
    /** Optional: a caller that can be abandoned should not keep paying for it. */
    signal?: AbortSignal
  ): Promise<{ parsed: T; usage: LlmUsage }> {
    const started = Date.now();
    const message = await this.client.messages.parse(request, signal ? { signal } : undefined);
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
