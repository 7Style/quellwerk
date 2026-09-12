/**
 * BullMQ queues on Redis (ADR-0009). Four of them: ingest, artifact, audio,
 * maintenance.
 *
 * This file is the only one that imports BullMQ. The processors are plain
 * functions in their modules, which is what lets them be tested without a Redis
 * and what keeps a queue library out of the business rules.
 */
import { Queue, Worker, type ConnectionOptions, type Job, type Processor } from 'bullmq';
import { Redis } from 'ioredis';

import { env } from '../../config/env.config.js';
import { logger } from '../../common/utils/logger.util.js';

export const QUEUE_NAMES = ['ingest', 'artifact', 'audio', 'maintenance'] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * What travels on the ingest queue. One queue, two kinds of work, and the
 * discriminator is on the message.
 *
 * It lives here and not in worker.ts because both sides need it: the API
 * enqueues, the worker reads. worker.ts cannot be the home, because it ends in
 * `await main()` and importing it to borrow a type would start a second worker
 * inside the API process.
 */
export type QueuedJob =
  | { kind: 'ingest'; sourceId: string; notebookId: string }
  | { kind: 'overview'; notebookId: string };

/** What travels on the artifact queue. Reports today, audio in M10. */
export type ArtifactJob = { kind: 'report'; artifactId: string; notebookId: string };

export function dedupeKey(notebookId: string, type: string, params: string): string {
  // No colon: BullMQ treats it as a separator in job ids.
  return [notebookId, type, params].join('.');
}

/**
 * BullMQ blocks on Redis with BRPOPLPUSH and friends. With ioredis' default of
 * 20 retries per request those blocking calls are aborted mid-wait and the
 * worker dies with "max retries per request"; the library requires null here
 * and says so at startup otherwise.
 */
export function createConnection(): Redis {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => {
    logger.error('[Queue] redis connection error', error);
  });
  return connection;
}

let sharedConnection: Redis | null = null;

function connection(): ConnectionOptions {
  sharedConnection ??= createConnection();
  return sharedConnection;
}

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        // Finished jobs are not the record of what happened; `status`, `step`
        // and `error` on the row are (ADR-0009). Keeping a few is for looking
        // over the worker's shoulder, not for state.
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

/**
 * Adds a job under a fixed id, so the same work is never queued twice.
 *
 * BullMQ ignores an add whose job id already exists. That is the dedupe: the
 * id is (notebook, type, params), so "ingest this source" is one job no matter
 * how many times the route is called.
 */
export async function enqueue<T extends object>(
  name: QueueName,
  jobId: string,
  data: T,
  queue: Pick<Queue, 'add'> = getQueue(name)
): Promise<void> {
  await queue.add(jobId, data, { jobId });
}

/**
 * Adds a job under a fixed id and runs it even if that id has run before.
 *
 * This is "Try again" on a failed report, and it is the other half of the
 * dedupe above rather than an exception to it. A report job that fails is
 * caught inside the processor and returns, so BullMQ files it as completed, and
 * `removeOnComplete: {count: 50}` keeps the finished job under its id. A plain
 * add is then dropped in silence: the row goes back to `queued`, the panel
 * shows "Waiting for the writer" and nothing ever runs. Measured against the
 * real Redis, not reasoned about - a second add ran zero times, a remove
 * followed by an add ran once.
 *
 * A job that is currently active is left alone and no new one is queued: the
 * work the reader is asking for is already happening.
 */
export async function enqueueReplacing<T extends object>(
  name: QueueName,
  jobId: string,
  data: T,
  queue: Pick<Queue, 'getJob' | 'add'> = getQueue(name)
): Promise<void> {
  const existing = await queue.getJob(jobId);

  if (existing) {
    const state = await existing.getState();
    if (state === 'active') return;
    await existing.remove();
  }

  await queue.add(jobId, data, { jobId });
}

/**
 * Adds a delayed job and lets a later add push the delay out again.
 *
 * This is the overview: three sources added within a few seconds should produce
 * one overview, not three. Each add removes the pending job and re-adds it with
 * a fresh delay, so the run happens once, after things have gone quiet.
 *
 * A job that is already running is left alone. Removing it would not stop it,
 * and adding a second one behind it is right: the sources changed after that
 * run started, so its result is already out of date.
 */
export async function enqueueDebounced<T extends object>(
  name: QueueName,
  jobId: string,
  data: T,
  delayMs: number,
  queue: Pick<Queue, 'getJob' | 'add'> = getQueue(name)
): Promise<void> {
  const existing = await queue.getJob(jobId);

  if (existing) {
    const state = await existing.getState();
    if (state === 'delayed' || state === 'waiting') {
      await existing.remove();
    } else if (state === 'active') {
      // Let it finish. The add below would collide with its id, so it is
      // skipped; the job that follows the next source will pick up the change.
      return;
    }
  }

  await queue.add(jobId, data, { jobId, delay: delayMs });
}

export function createWorker<T>(
  name: QueueName,
  processor: Processor<T, void, string>,
  concurrency = 2
): Worker<T, void, string> {
  const worker = new Worker<T, void, string>(name, processor, {
    connection: connection(),
    concurrency,
  });

  worker.on('failed', (job: Job<T, void, string> | undefined, error: Error) => {
    logger.error('[Queue] job failed', error, { queue: name, jobId: job?.id, attempts: job?.attemptsMade });
  });

  return worker;
}

export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) await queue.close();
  queues.clear();
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
