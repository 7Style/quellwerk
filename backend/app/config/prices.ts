/**
 * List prices per million tokens, checked on 2026-09-11 against
 * https://platform.claude.com/docs/en/about-claude/pricing (ADR-0011).
 *
 * Costs are kept as micro-cents everywhere so a sum over thousands of rows does
 * not drift; the callers that compare against a cap multiply the cap by
 * 1_000_000 rather than dividing the sum.
 *
 * The table carries the two published numbers per model and derives the three
 * cache prices from the documented multipliers. That is deliberate: the two
 * numbers are the ones printed on the pricing page, so checking this file
 * against it is reading two figures per row rather than five.
 */

export interface ModelPrice {
  /** USD per million input tokens */
  inputPerMTok: number;
  /** USD per million output tokens */
  outputPerMTok: number;
}

export const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  // $2 / $10 was introductory pricing until 31.08.2026 and is now the standard
  // price; the announced increase to $3 / $15 was cancelled.
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

/**
 * A price of $X per million tokens is X * 100 micro-cents per token: a dollar
 * is 100 cents and a cent is 1,000,000 micro-cents.
 */
const MICRO_CENTS_PER_TOKEN_PER_USD_PER_MTOK = 100;

export interface TokenCounts {
  /** Fresh input tokens: neither read from nor written to the cache. */
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

export class UnknownModelPriceError extends Error {
  constructor(readonly model: string) {
    super(`no price for model "${model}"; add it to config/prices.ts`);
    this.name = 'UnknownModelPriceError';
  }
}

/** Micro-cents for one token of this kind, rounded to an integer. */
function microCentsPerToken(usdPerMTok: number, multiplier = 1): number {
  // Rounded here and not at the end. 0.1 has no exact binary representation,
  // so a cache read price would otherwise carry a tail of 1e-14 into every sum.
  return Math.round(usdPerMTok * MICRO_CENTS_PER_TOKEN_PER_USD_PER_MTOK * multiplier);
}

/** The five per-token prices for one model, as integers. */
export function pricesFor(model: string): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
} {
  const price = PRICES[model];
  if (!price) throw new UnknownModelPriceError(model);

  return {
    input: microCentsPerToken(price.inputPerMTok),
    output: microCentsPerToken(price.outputPerMTok),
    cacheRead: microCentsPerToken(price.inputPerMTok, CACHE_MULTIPLIER.read),
    cacheWrite5m: microCentsPerToken(price.inputPerMTok, CACHE_MULTIPLIER.write5m),
    cacheWrite1h: microCentsPerToken(price.inputPerMTok, CACHE_MULTIPLIER.write1h),
  };
}

/**
 * Cost of one call in micro-cents.
 *
 * The two cache write durations are separate terms and not one "cache write"
 * number, because they are priced differently and a single figure would hide
 * which one was paid for. A request that writes an hour-long document cache and
 * a five-minute history cache pays both, and `usage_log` keeps the two counts
 * in their own columns so the bill can be read back apart.
 *
 * An unknown model throws rather than costing zero. A zero would quietly say
 * "this was free" and the daily budget would never notice the spend.
 */
export function priceCall(model: string, tokens: TokenCounts): number {
  const prices = pricesFor(model);

  return (
    tokens.inputTokens * prices.input +
    tokens.outputTokens * prices.output +
    tokens.cacheRead * prices.cacheRead +
    tokens.cacheWrite5m * prices.cacheWrite5m +
    tokens.cacheWrite1h * prices.cacheWrite1h
  );
}

/** Micro-cents as a dollar amount, for a log line or the Trace panel. */
export function formatMicroCents(microCents: number): string {
  return (microCents / MICRO_CENTS_PER_CENT / 100).toFixed(4);
}
