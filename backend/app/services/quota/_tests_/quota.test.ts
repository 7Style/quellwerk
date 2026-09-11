/**
 * The daily budget. M2 opened the path that spends money; this is the thing
 * that stops it.
 */
import { describe, expect, it } from '@jest/globals';

import {
  assertBudgetLeft,
  BudgetSpentError,
  dailyCapMicroCents,
  remainingTodayMicroCents,
  startOfToday,
  type SpendReader,
} from '../index.js';

function reader(spent: number): SpendReader {
  return { spentSinceMicroCents: async () => spent };
}

describe('assertBudgetLeft', () => {
  it('lets a request through while there is budget left', async () => {
    await expect(assertBudgetLeft(reader(dailyCapMicroCents - 1))).resolves.toBeUndefined();
  });

  it('refuses once the cap is reached', async () => {
    await expect(assertBudgetLeft(reader(dailyCapMicroCents))).rejects.toBeInstanceOf(
      BudgetSpentError
    );
  });

  it('answers 503 with the banner text from the spec', async () => {
    // The message is shown as it stands, so it is the German sentence the UI
    // puts in the banner and not an English developer string.
    const error = await assertBudgetLeft(reader(dailyCapMicroCents)).catch((e: unknown) => e);

    expect(error).toMatchObject({ statusCode: 503, errorCode: 'BUDGET_SPENT' });
    expect((error as Error).message).toBe('Tagesbudget erreicht');
  });

  it('refuses when it cannot read the spend, rather than guessing', async () => {
    // The alternative is spending money on the strength of a query that did not
    // run. A budget that opens when the database is unreachable is not a budget.
    const broken: SpendReader = {
      spentSinceMicroCents: () => Promise.reject(new Error('database is gone')),
    };

    await expect(assertBudgetLeft(broken)).rejects.toBeInstanceOf(BudgetSpentError);
  });
});

describe('startOfToday', () => {
  it('is midnight UTC, so the window is the same everywhere', () => {
    const midnight = startOfToday(new Date('2026-09-11T22:45:12.345Z'));
    expect(midnight.toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });
});

describe('remainingTodayMicroCents', () => {
  it('reports what is left', async () => {
    await expect(remainingTodayMicroCents(reader(dailyCapMicroCents / 4))).resolves.toBe(
      dailyCapMicroCents * 0.75
    );
  });

  it('never reports a negative amount', async () => {
    // Spend can overshoot the cap: a call that was already in flight when the
    // gate closed still gets billed.
    await expect(remainingTodayMicroCents(reader(dailyCapMicroCents * 2))).resolves.toBe(0);
  });
});
