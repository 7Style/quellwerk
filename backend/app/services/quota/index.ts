/**
 * Rate limits and the daily budget (SECURITY.md 7.3). Limits run through
 * rate-limit-redis, so there is no bucket table; the budget is a sum over
 * usage_log. The cap is configured in cents and multiplied by 1_000_000 before
 * the comparison, because usage_log stores micro-cents.
 *
 * The full quota service with its banner and its per-route wiring is M7-T2.
 * What is here already is the one thing M2 made urgent: M2 opened the path that
 * spends money - a source guide and possibly a notebook title per source, plus
 * an overview over the whole notebook on MODEL_CHAT - and left the cap as a
 * stub that threw. An anonymous caller could have spent without bound.
 */
import { env } from '../../config/env.config.js';
import { MICRO_CENTS_PER_CENT } from '../../config/prices.js';
import { logger } from '../../common/utils/logger.util.js';
import { prisma } from '../../lib/prisma.js';

export const dailyCapMicroCents = env.DAILY_SPEND_CAP_CENTS * MICRO_CENTS_PER_CENT;
export const evalCapMicroCents = env.EVAL_SPEND_CAP_CENTS * MICRO_CENTS_PER_CENT;

export class BudgetSpentError extends Error {
  readonly statusCode = 503;
  readonly errorCode = 'BUDGET_SPENT';

  constructor() {
    // The banner text from docs/SPEC.md. It is shown as it stands.
    super('Tagesbudget erreicht');
    this.name = 'BudgetSpentError';
  }
}

/** What this service needs from storage, so a test can hand it a number. */
export interface SpendReader {
  spentSinceMicroCents(since: Date): Promise<number>;
}

const prismaSpendReader: SpendReader = {
  spentSinceMicroCents: async (since) => {
    const result = await prisma.usageLog.aggregate({
      _sum: { costMicroCents: true },
      where: { createdAt: { gte: since } },
    });
    return result._sum.costMicroCents ?? 0;
  },
};

/** Midnight UTC. One fixed boundary beats a rolling window nobody can predict. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Throws when today's spend has reached the cap.
 *
 * Called before work is queued, not after: the point is to not start the calls,
 * and a check that runs once the tokens are spent is an audit, not a budget.
 *
 * It reads the sum rather than keeping a counter. One indexed aggregate per
 * added source is cheap next to the model calls it guards, and a counter would
 * be a second truth that can drift from the table the invoice is read out of.
 *
 * A failing read does NOT open the gate. If the database cannot be asked, the
 * honest answer is to refuse: the alternative is spending money on the strength
 * of a query that did not run.
 */
export async function assertBudgetLeft(reader: SpendReader = prismaSpendReader): Promise<void> {
  let spent: number;
  try {
    spent = await reader.spentSinceMicroCents(startOfToday());
  } catch (error) {
    logger.error('budget check could not read usage_log; refusing rather than guessing', error);
    throw new BudgetSpentError();
  }

  if (spent >= dailyCapMicroCents) {
    logger.warn('daily budget reached', { spent, cap: dailyCapMicroCents });
    throw new BudgetSpentError();
  }
}

/** For the Trace panel and the admin page: what is left of today. */
export async function remainingTodayMicroCents(
  reader: SpendReader = prismaSpendReader
): Promise<number> {
  const spent = await reader.spentSinceMicroCents(startOfToday());
  return Math.max(0, dailyCapMicroCents - spent);
}
