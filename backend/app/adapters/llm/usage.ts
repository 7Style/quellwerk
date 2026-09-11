/**
 * Reads the usage numbers out of an SDK response.
 *
 * It lives in the adapter and not in the usage-log service because it knows the
 * shape of an Anthropic response, and that knowledge is exactly what the
 * adapter layer exists to contain (ADR-0004). The service takes the result and
 * prices it; it never sees a field name from the API.
 */
import type { LlmUsage } from './llm.interface.js';

/**
 * `cache_creation` splits the write by TTL. When it is absent the write is
 * reported only as a total in `cache_creation_input_tokens`, and that total is
 * booked as a five minute write: the five minute price is the lower of the two,
 * so an unknown split is priced in the direction that cannot silently overstate
 * the budget that is left.
 */
export function usageFrom(
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
  } | null
  | undefined,
  extras: { stopReason?: string | null; requestId?: string | null; latencyMs: number }
): LlmUsage {
  const split = usage?.cache_creation;
  const write5m = split?.ephemeral_5m_input_tokens ?? null;
  const write1h = split?.ephemeral_1h_input_tokens ?? null;
  const totalWrite = usage?.cache_creation_input_tokens ?? 0;

  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheWrite5m: write5m ?? (write1h === null ? totalWrite : 0),
    cacheWrite1h: write1h ?? 0,
    stopReason: extras.stopReason ?? null,
    requestId: extras.requestId ?? null,
    latencyMs: extras.latencyMs,
  };
}
