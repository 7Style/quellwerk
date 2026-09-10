/**
 * Rate limits and the daily budget (SECURITY.md 7.3). Limits run through
 * rate-limit-redis, so there is no bucket table; the budget is a sum over
 * usage_log. The cap is configured in cents and multiplied by 1_000_000 before
 * the comparison, because usage_log stores micro-cents.
 * Implementation arrives in M7-T2.
 */
import { env } from '../../config/env.config.js';
import { MICRO_CENTS_PER_CENT } from '../../config/prices.js';

export const dailyCapMicroCents = env.DAILY_SPEND_CAP_CENTS * MICRO_CENTS_PER_CENT;
export const evalCapMicroCents = env.EVAL_SPEND_CAP_CENTS * MICRO_CENTS_PER_CENT;

export function assertBudgetLeft(): Promise<void> {
  throw new Error('quota.assertBudgetLeft arrives in M7-T2');
}
