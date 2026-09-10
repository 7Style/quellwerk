/**
 * BullMQ queues on Redis (ADR-0009). Four of them: ingest, artifact, audio,
 * maintenance. A job is idempotent over (notebook, type, params); job ids never
 * contain a colon because BullMQ uses it as a separator internally, and the
 * ioredis client uses maxRetriesPerRequest: null.
 * Implementation arrives in M2-T2.
 */
export const QUEUE_NAMES = ['ingest', 'artifact', 'audio', 'maintenance'] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export function dedupeKey(notebookId: string, type: string, params: string): string {
  // No colon: BullMQ treats it as a separator in job ids.
  return [notebookId, type, params].join('.');
}
