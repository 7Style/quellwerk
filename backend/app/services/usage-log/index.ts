/**
 * Every model call writes one row. Costs are micro-cents (config/prices.ts), and
 * the two cache write durations are counted separately because they are priced
 * separately (ADR-0011). Implementation arrives in M2-T2 with the first call.
 */
import type { LlmUsage } from '../../adapters/llm/index.js';

export interface UsageEntry extends LlmUsage {
  sessionId?: string;
  notebookId?: string;
  route: string;
  model: string;
  effort?: string;
}

export function recordUsage(_entry: UsageEntry): Promise<void> {
  throw new Error('usage-log.recordUsage arrives in M2-T2');
}
