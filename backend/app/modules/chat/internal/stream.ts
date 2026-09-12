/**
 * The SSE side of a chat turn: the eight events from docs/ARCHITECTURE.md and
 * everything needed to keep a stream alive through a proxy.
 *
 * Three things here exist only because something in the path between Node and a
 * browser wants to buffer:
 *
 *   `X-Accel-Buffering: no` tells nginx not to hold the response back. Without
 *   it the host nginx collects the whole answer and delivers it at once, and
 *   the stream is a slow request with extra steps.
 *
 *   `Cache-Control: no-transform` asks every proxy in between not to recompress
 *   or rewrite the body. gzip on an event stream is the same failure again, one
 *   hop further out; app.ts also exempts `text/event-stream` from compression
 *   on our side.
 *
 *   A comment heartbeat every fifteen seconds. A proxy that sees nothing for a
 *   minute closes the connection, and the first token of an answer over a large
 *   notebook can be four or five seconds away - but a report or a slow upstream
 *   can be much longer.
 *
 * None of the three shows up in a local test. They show up behind the proxy, in
 * production, as "the answer appears all at once at the end".
 */
import type { Response } from 'express';

import type { VerifiedCitation } from './citations.js';

/**
 * The token counts of a turn. Both model calls of the turn are in here: the
 * chat on MODEL_CHAT and the follow-up questions on MODEL_FAST, which is why
 * the numbers are sums and the trace names two models.
 */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** What the Trace panel shows once a turn is finished. */
export interface TurnTrace {
  model: string;
  effort: string | null;
  latencyMs: number;
  costMicroCents: number;
  /** How many citations failed the check. Shown, not hidden (docs/SPEC.md). */
  droppedCitations: number;
  stopReason: string | null;
}

/**
 * The eight events. `i` is the index of the segment an event belongs to, so the
 * client can attach a citation to the right paragraph without guessing.
 */
export type ChatEvent =
  | { t: 'open'; i: number }
  | { t: 'text'; i: number; d: string }
  | { t: 'cite'; i: number; c: VerifiedCitation }
  | { t: 'followups'; q: string[] }
  | { t: 'truncated' }
  | { t: 'refused'; m: string }
  /**
   * `refused` so the client never needs the refusal sentences itself. The route
   * owns them, enforces that a refusal carries no chip, and says which it was.
   */
  /**
   * `messageId` ist die gespeicherte Antwortzeile, oder null.
   *
   * Null im Demo-Notizbuch, wo kein Turn gespeichert wird: dort gibt es nichts
   * zu sichern, und die Oberflaeche zeigt den Knopf deshalb gar nicht erst.
   */
  | { t: 'done'; usage: TurnUsage; trace: TurnTrace; refused: boolean; messageId: string | null }
  | { t: 'error'; m: string; retry: boolean };

/** The part of a response this writer needs, so a test can hand it a fake. */
export interface SseTarget {
  setHeader(name: string, value: string): void;
  flushHeaders?(): void;
  write(chunk: string): boolean;
  end(): void;
  writableEnded: boolean;
}

export const HEARTBEAT_MS = 15_000;

export class SseStream {
  private heartbeat: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly target: SseTarget,
    private readonly heartbeatMs: number = HEARTBEAT_MS
  ) {}

  /** Writes the headers and starts the heartbeat. Call once, before anything else. */
  open(): void {
    this.target.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.target.setHeader('Cache-Control', 'no-cache, no-transform');
    this.target.setHeader('Connection', 'keep-alive');
    // The one header that is not part of the SSE standard and the one that
    // decides whether this works behind the host nginx.
    this.target.setHeader('X-Accel-Buffering', 'no');
    this.target.flushHeaders?.();

    this.heartbeat = setInterval(() => {
      // A comment line: valid SSE, ignored by every client, enough traffic to
      // keep a proxy from deciding the connection is idle.
      if (!this.closed) this.target.write(': ping\n\n');
    }, this.heartbeatMs);
    // Nothing should wait for this timer at shutdown.
    this.heartbeat.unref?.();
  }

  send(event: ChatEvent): void {
    if (this.closed || this.target.writableEnded) return;
    this.target.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * Ends the stream. Safe to call twice: the error path and the normal path
   * both end up here, and a double close on an aborted request is the usual
   * case rather than the exception.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (!this.target.writableEnded) this.target.end();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

/** Express's Response satisfies SseTarget; this keeps the cast in one place. */
export function sseFrom(res: Response, heartbeatMs?: number): SseStream {
  return new SseStream(res, heartbeatMs);
}

/**
 * Maps `stop_reason` to the events that follow the answer.
 *
 * `end_turn` is the normal case and adds nothing. `max_tokens` means the answer
 * stopped mid-sentence, and saying so is the difference between a bug report
 * and a known limit. `refusal` is the model declining, which is not the same as
 * the product's own refusal sentence and must not be shown as one.
 */
export function eventsForStopReason(stopReason: string | null): ChatEvent[] {
  switch (stopReason) {
    case 'max_tokens':
      return [{ t: 'truncated' }];
    case 'refusal':
      return [
        {
          t: 'refused',
          m: 'The model declined to answer this question. That is not the same as the sources not covering it.',
        },
      ];
    default:
      return [];
  }
}

/**
 * A message for the client and whether trying again could help.
 *
 * `retry` is what the UI uses to decide between "Try again" and "Something is
 * wrong". Overload and a network hiccup pass; a bad request or an exhausted
 * budget do not, and offering a button that cannot work is worse than saying so.
 */
/**
 * Anthropic's wording for an exhausted spend limit or an empty balance. Matched
 * on the error type rather than on the message, which is free text; the message
 * check is the fallback and stays narrow so no other 400 borrows this banner.
 */
function isCreditError(error: unknown): boolean {
  const body = (error as { error?: { error?: { type?: string; message?: string } } } | null)?.error
    ?.error;
  if (body?.type === 'billing_error') return true;
  const message = body?.message ?? '';
  return /credit balance|spend limit/i.test(message);
}

export function errorEvent(error: unknown): ChatEvent {
  const status = (error as { status?: number } | null)?.status;

  if (status === 429 || status === 529) {
    return { t: 'error', m: 'The model is busy right now. Try again in a moment.', retry: true };
  }
  if (typeof status === 'number' && status >= 500) {
    // Including 503. Our own daily budget is checked before the stream opens and
    // answers as JSON with its own message; a 503 arriving mid-stream comes from
    // the model service and means the opposite of "you have spent enough".
    return { t: 'error', m: 'The model service had a problem. Try again in a moment.', retry: true };
  }
  if (status === 400 && isCreditError(error)) {
    // Anthropic reports an exhausted spend limit as a 4xx, not as a 503. It is
    // the one 4xx the reader is entitled to an explanation for, because it is
    // the same situation our own budget guard describes (SECURITY.md 7.3).
    return { t: 'error', m: 'Das Tagesbudget der Demo ist erreicht.', retry: false };
  }
  if (typeof status === 'number' && status >= 400) {
    // A 4xx is our own mistake in building the request. The user cannot fix it
    // by pressing a button, and the details belong in the log, not on screen.
    return { t: 'error', m: 'This question could not be sent. The problem is on our side.', retry: false };
  }

  // Everything else, including a dropped connection to the upstream.
  return { t: 'error', m: 'The answer stopped unexpectedly. Try again.', retry: true };
}
