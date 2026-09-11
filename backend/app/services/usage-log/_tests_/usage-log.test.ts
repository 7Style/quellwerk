import { describe, expect, it, jest } from '@jest/globals';

import { usageFrom } from '../../../adapters/llm/usage.js';
import { priceCall, pricesFor, UnknownModelPriceError } from '../../../config/prices.js';
import { recordUsage, type UsageLogWriter, type UsageRow } from '../index.js';

function collectingWriter(): UsageLogWriter & { rows: UsageRow[] } {
  const rows: UsageRow[] = [];
  return {
    rows,
    create: async ({ data }) => {
      rows.push(data);
      return data;
    },
  };
}

const zeroUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  stopReason: null,
  requestId: null,
  latencyMs: 0,
};

describe('prices', () => {
  it('converts dollars per million tokens to integer micro-cents', () => {
    // $5 per MTok is 500 micro-cents per token: a dollar is 100 cents, a cent
    // is 1,000,000 micro-cents.
    expect(pricesFor('claude-opus-5').input).toBe(500);
    expect(pricesFor('claude-opus-5').output).toBe(2_500);
    expect(pricesFor('claude-haiku-4-5').input).toBe(100);
  });

  it('derives the three cache prices from the documented multipliers', () => {
    const opus = pricesFor('claude-opus-5');
    expect(opus.cacheWrite5m).toBe(625); // 1.25x
    expect(opus.cacheWrite1h).toBe(1_000); // 2x
    expect(opus.cacheRead).toBe(50); // 0.1x
  });

  it('keeps every price an integer, so sums do not drift', () => {
    // 0.1 has no exact binary representation. Without rounding, a cache read
    // price would carry a tail of 1e-14 into every row and every sum.
    for (const model of ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']) {
      for (const price of Object.values(pricesFor(model))) {
        expect(Number.isInteger(price)).toBe(true);
      }
    }
  });

  it('throws for a model it does not know instead of costing nothing', () => {
    // A zero would say "this was free" and the daily budget would never notice.
    expect(() => priceCall('claude-imaginary-9', { ...zeroUsage })).toThrow(UnknownModelPriceError);
  });

  it('prices the two cache write durations separately', () => {
    // The point of keeping them apart: 1.25x and 2x are different prices, and a
    // single "cache write" figure would hide which one was paid.
    const cost = priceCall('claude-opus-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite5m: 1_000,
      cacheWrite1h: 1_000,
    });

    expect(cost).toBe(1_000 * 625 + 1_000 * 1_000);
  });
});

describe('recordUsage', () => {
  it('writes one row and returns what it cost', async () => {
    const writer = collectingWriter();

    const cost = await recordUsage(
      {
        ...zeroUsage,
        inputTokens: 1_000,
        outputTokens: 200,
        cacheWrite1h: 50_000,
        cacheRead: 10_000,
        route: 'ingest.source-guide',
        model: 'claude-opus-5',
        notebookId: 'nb-1',
        latencyMs: 1_234,
      },
      writer
    );

    expect(writer.rows).toHaveLength(1);
    expect(cost).toBe(1_000 * 500 + 200 * 2_500 + 50_000 * 1_000 + 10_000 * 50);
    expect(writer.rows[0].costMicroCents).toBe(cost);
  });

  it('keeps the five minute and one hour writes on their own columns', async () => {
    const writer = collectingWriter();

    await recordUsage(
      {
        ...zeroUsage,
        cacheWrite5m: 3_000,
        cacheWrite1h: 40_000,
        route: 'chat',
        model: 'claude-opus-5',
      },
      writer
    );

    expect(writer.rows[0].cacheWrite5m).toBe(3_000);
    expect(writer.rows[0].cacheWrite1h).toBe(40_000);
  });

  it('carries no text of any kind', async () => {
    // A row holds ids, counts, a price and a latency. Source text, a question or
    // an answer in here would be a second copy of the user's data, kept longer
    // than the notebook it came from (CLAUDE.md).
    const writer = collectingWriter();
    await recordUsage({ ...zeroUsage, route: 'chat', model: 'claude-opus-5' }, writer);

    const fields = Object.keys(writer.rows[0]);
    expect(fields).toEqual(
      expect.arrayContaining(['route', 'model', 'inputTokens', 'costMicroCents'])
    );
    for (const forbidden of ['text', 'question', 'answer', 'content', 'prompt', 'citedText']) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it('survives a failing write, because the call was billed either way', async () => {
    // Accounting must not take down the answer the user is waiting for. The
    // money is spent whether or not the row lands; the log line makes the gap
    // visible afterwards.
    const failing: UsageLogWriter = {
      create: () => Promise.reject(new Error('database is gone')),
    };

    await expect(
      recordUsage({ ...zeroUsage, inputTokens: 10, route: 'chat', model: 'claude-opus-5' }, failing)
    ).resolves.toBe(10 * 500);
  });
});

describe('usageFrom', () => {
  it('splits a cache write by its two durations when the API reports them', () => {
    const usage = usageFrom(
      {
        input_tokens: 12,
        output_tokens: 34,
        cache_read_input_tokens: 56,
        cache_creation_input_tokens: 900,
        cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 800 },
      },
      { latencyMs: 5, stopReason: 'end_turn', requestId: 'req_1' }
    );

    expect(usage).toMatchObject({
      inputTokens: 12,
      outputTokens: 34,
      cacheRead: 56,
      cacheWrite5m: 100,
      cacheWrite1h: 800,
      stopReason: 'end_turn',
      requestId: 'req_1',
    });
  });

  it('books an unsplit write as the cheaper of the two', () => {
    // An unknown split priced as an hour would overstate the spend and could
    // close the budget early; priced as five minutes it can only understate,
    // and the total still lands on the same row for anyone reading it back.
    const usage = usageFrom(
      { cache_creation_input_tokens: 500 },
      { latencyMs: 1 }
    );

    expect(usage.cacheWrite5m).toBe(500);
    expect(usage.cacheWrite1h).toBe(0);
  });

  it('reads a response with no usage at all as zeros', () => {
    expect(usageFrom(undefined, { latencyMs: 3 })).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      latencyMs: 3,
    });
  });
});

describe('a call that writes both caches', () => {
  it('produces one row whose cost is the sum of five separate terms', async () => {
    const writer = collectingWriter();
    const spy = jest.spyOn(writer, 'create');

    const usage = usageFrom(
      {
        input_tokens: 400,
        output_tokens: 1_200,
        cache_read_input_tokens: 20_000,
        cache_creation_input_tokens: 63_769,
        cache_creation: { ephemeral_5m_input_tokens: 3_769, ephemeral_1h_input_tokens: 60_000 },
      },
      { latencyMs: 17_187, stopReason: 'end_turn', requestId: 'req_live' }
    );

    const cost = await recordUsage(
      { ...usage, route: 'ingest.notebook-overview', model: 'claude-opus-5', notebookId: 'nb' },
      writer
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cost).toBe(
      400 * 500 + 1_200 * 2_500 + 20_000 * 50 + 3_769 * 625 + 60_000 * 1_000
    );
  });
});
