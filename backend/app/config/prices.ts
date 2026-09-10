/**
 * List prices per million tokens, checked on 2026-09-10 against
 * https://platform.claude.com/docs/en/about-claude/pricing (ADR-0011).
 *
 * Costs are kept as micro-cents everywhere so a sum over thousands of rows does
 * not drift; the callers that compare against a cap multiply the cap by
 * 1_000_000 rather than dividing the sum.
 */

export interface ModelPrice {
  /** USD per million input tokens */
  inputPerMTok: number;
  /** USD per million output tokens */
  outputPerMTok: number;
}

export const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
};

/** Multipliers on the model's own base input price. */
export const CACHE_MULTIPLIER = {
  write5m: 1.25,
  write1h: 2,
  read: 0.1,
} as const;

export const MICRO_CENTS_PER_CENT = 1_000_000;
