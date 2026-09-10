/**
 * The single place that creates the Anthropic client and calls the API
 * (ADR-0004). Implementation arrives with the routes that need it: the artifact
 * path in M2, the chat stream in M3.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ILlmProvider, LlmUsage } from './llm.interface.js';

export class AnthropicLlmAdapter implements ILlmProvider {
  streamChat(_request: Anthropic.MessageCreateParams): AsyncIterable<unknown> {
    throw new Error('AnthropicLlmAdapter.streamChat arrives in M3-T3');
  }

  parseArtifact<T>(
    _request: Anthropic.MessageCreateParams
  ): Promise<{ parsed: T; usage: LlmUsage }> {
    throw new Error('AnthropicLlmAdapter.parseArtifact arrives in M2-T2');
  }
}
