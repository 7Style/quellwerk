/**
 * Worker process. Everything that takes longer than a chat turn runs here
 * (ADR-0009): ingest, artifact, audio, maintenance.
 *
 * Every job is idempotent over (notebook, type, params), writes `step` and
 * `heartbeatAt` on the row it works on, and always ends in a terminal status.
 * Stalled work is found through the (status, heartbeatAt) index rather than a
 * job table. The processors arrive with their milestones: ingest in M2-T2,
 * artifact in M6-T1, audio in M10, maintenance in M7-T5.
 *
 * With no processor registered the process would fall off the end of main() and
 * exit, and `restart: unless-stopped` would turn that into a restart loop. It
 * therefore holds the event loop open and shuts down on a signal, which is also
 * how it will behave once the BullMQ workers own the loop.
 */
import { logger } from './common/utils/logger.util.js';
import { QUEUE_NAMES } from './services/queue/index.js';

const IDLE_TICK_MS = 60_000;

function main(): void {
  logger.info('[Worker] starting', { queues: QUEUE_NAMES });
  logger.info('[Worker] no processors registered yet; they arrive with their milestones');

  const keepAlive = setInterval(() => {
    // Nothing to do yet. The interval exists so the process stays up instead of
    // exiting and being restarted forever.
  }, IDLE_TICK_MS);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info('[Worker] shutting down', { signal });
    clearInterval(keepAlive);
    // Once processors exist they are closed here before the process ends.
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
