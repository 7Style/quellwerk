/**
 * Worker process. Everything that takes longer than a chat turn runs here
 * (ADR-0009): ingest, artifact, audio, maintenance.
 *
 * Every job is idempotent over (notebook, type, params), writes `step` and
 * `heartbeatAt` on the row it works on, and always ends in a terminal status.
 * Stalled work is found through the (status, heartbeatAt) index rather than a
 * job table. The processors arrive with their milestones: ingest in M2-T2,
 * artifact in M6-T1, audio in M10, maintenance in M7-T5.
 */
import { logger } from './common/utils/logger.util.js';
import { QUEUE_NAMES } from './services/queue/index.js';

async function main(): Promise<void> {
  logger.info('[Worker] starting', { queues: QUEUE_NAMES });
  logger.info('[Worker] no processors registered yet; they arrive with their milestones');
  return Promise.resolve();
}

main().catch((error: unknown) => {
  logger.error('[Worker] failed to start', error);
  process.exitCode = 1;
});
