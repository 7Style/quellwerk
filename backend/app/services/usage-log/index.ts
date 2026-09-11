/**
 * Every model call writes one row. Costs are micro-cents (config/prices.ts), and
 * the two cache write durations are counted separately because they are priced
 * separately (ADR-0011).
 *
 * What a row must never contain: source text, a question, an answer, a title
 * somebody typed. It holds ids, counts, a price and a latency (CLAUDE.md). The
 * daily budget is a sum over this table and needs nothing else; anything more
 * would be a second copy of the user's data with a longer retention than the
 * notebook it came from.
 */
import { priceCall } from '../../config/prices.js';
import { logger } from '../../common/utils/logger.util.js';
import { prisma } from '../../lib/prisma.js';
import type { LlmUsage } from '../../adapters/llm/index.js';

export interface UsageEntry extends LlmUsage {
  sessionId?: string | null;
  notebookId?: string | null;
  /** Which code path made the call: `ingest.source-guide`, `chat`, `report.faq`. */
  route: string;
  model: string;
  effort?: string | null;
}

/** One row, exactly as it goes into the table. */
export interface UsageRow {
  sessionId: string | null;
  notebookId: string | null;
  route: string;
  model: string;
  effort: string | null;
  inputTokens: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  outputTokens: number;
  costMicroCents: number;
  requestId: string | null;
  latencyMs: number;
  stopReason: string | null;
}

/**
 * The minimum this module needs from Prisma, so a test can hand it a fake.
 * The `{ data }` wrapper is Prisma's own shape, kept so the delegate can be
 * passed straight in without an adapter in between.
 */
export interface UsageLogWriter {
  create(args: { data: UsageRow }): Promise<unknown>;
}

/**
 * Writes one row and returns what it cost.
 *
 * A failure here is logged and swallowed. Accounting must not take down the
 * answer the user is waiting for: the call has happened and the money is spent
 * whether or not the row lands, and a chat turn that dies because a log write
 * failed would lose both the answer and the record of it. The log line is what
 * makes the gap visible afterwards.
 */
export async function recordUsage(
  entry: UsageEntry,
  writer: UsageLogWriter = prisma.usageLog
): Promise<number> {
  const costMicroCents = priceCall(entry.model, {
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheRead: entry.cacheRead,
    cacheWrite5m: entry.cacheWrite5m,
    cacheWrite1h: entry.cacheWrite1h,
  });

  try {
    await writer.create({
      data: {
        sessionId: entry.sessionId ?? null,
        notebookId: entry.notebookId ?? null,
        route: entry.route,
        model: entry.model,
        effort: entry.effort ?? null,
        inputTokens: entry.inputTokens,
        cacheRead: entry.cacheRead,
        cacheWrite5m: entry.cacheWrite5m,
        cacheWrite1h: entry.cacheWrite1h,
        outputTokens: entry.outputTokens,
        costMicroCents,
        requestId: entry.requestId,
        latencyMs: entry.latencyMs,
        stopReason: entry.stopReason,
      },
    });
  } catch (error) {
    logger.error('usage_log write failed; the call still happened and was billed', error, {
      route: entry.route,
      model: entry.model,
      costMicroCents,
    });
  }

  return costMicroCents;
}
