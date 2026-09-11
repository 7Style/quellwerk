/**
 * One chat turn, from the question to the last event on the wire.
 *
 * The order is the contract (docs/ARCHITECTURE.md) and the order is the point:
 * text goes out as it arrives, a citation goes out only after it has been
 * checked against the stored text, and `done` carries the numbers. A citation
 * that reached the client before the check would already be on screen when it
 * turned out to be wrong.
 *
 * Everything is injected. This file knows nothing about Prisma, BullMQ, Express
 * or the SDK; what it knows is what has to happen in which order, which is the
 * part worth testing without any of the four.
 */
import type Anthropic from '@anthropic-ai/sdk';

import {
  answerText,
  resolveCitations,
  type CitableSource,
  type DroppedCitation,
} from '../internal/citations.js';
import {
  errorEvent,
  eventsForStopReason,
  type ChatEvent,
  type TurnTrace,
  type TurnUsage,
} from '../internal/stream.js';

/** Where an event goes. The route hands in an SseStream; a test hands in an array. */
export interface EventSink {
  send(event: ChatEvent): void;
  readonly isClosed: boolean;
}

export interface TurnRequest {
  notebookId: string;
  sessionId: string;
  question: string;
  style?: string;
  length?: string;
  customInstructions?: string;
}

export interface TurnSources {
  /** Every ready source, in position order. No selection (docs/KNOWN-LIMITS.md). */
  sources: CitableSource[];
  /** Index by `document_index`, from the request builder. */
  sourceIds: string[];
  pageAt(sourceId: string, offset: number): number | null;
}

export interface StoredTurn {
  question: string;
  segments: Array<{ text: string; citations: unknown[] }>;
  droppedCitations: number;
  usage: TurnUsage;
  trace: TurnTrace;
}

export interface ChatServiceDeps {
  /** Loads the notebook's ready sources, already scoped to the session. */
  loadSources(notebookId: string, sessionId: string): Promise<TurnSources>;
  /** Builds and runs the request; yields our own events. */
  stream(input: TurnRequest, sources: TurnSources, signal: AbortSignal): AsyncIterable<StreamEvent>;
  /** Three follow-up questions on MODEL_FAST, after the answer. */
  followUps(input: { question: string; answer: string; sources: CitableSource[] }): Promise<string[]>;
  /** Prices the call and writes the usage row. Returns the cost. */
  recordUsage(message: Anthropic.Message, latencyMs: number, notebookId: string): Promise<TurnTrace>;
  saveTurn(notebookId: string, turn: StoredTurn): Promise<void>;
  onError(error: unknown, context: { notebookId: string }): void;
}

/** Re-exported so the route and the tests agree on the shape without a cycle. */
export type StreamEvent =
  | { type: 'segment'; segment: number }
  | { type: 'text'; segment: number; text: string }
  | { type: 'citation'; segment: number; citation: Anthropic.TextCitation }
  | { type: 'done'; message: Anthropic.Message };

export class ChatService {
  constructor(private readonly deps: ChatServiceDeps) {}

  /**
   * Runs a turn and writes every event to the sink.
   *
   * It never throws. A turn that fails ends with one `error` event and a closed
   * stream, because the caller is an HTTP response that has already sent its
   * headers: there is no status code left to change, and an exception here
   * would leave the browser waiting for an answer that will never come.
   */
  async run(
    input: TurnRequest,
    sink: EventSink,
    signal: AbortSignal
  ): Promise<{ status: 'done' | 'error' | 'aborted' }> {
    const started = Date.now();

    try {
      const sources = await this.deps.loadSources(input.notebookId, input.sessionId);

      const segments: Array<{ text: string; citations: unknown[] }> = [];
      const dropped: DroppedCitation[] = [];
      let finished: Anthropic.Message | null = null;

      // Built once. It was inside the citation branch, which rebuilt a map over
      // every source for every chip: fifty sources and twenty citations is a
      // thousand entries for no reason.
      const byId = new Map(sources.sources.map((source) => [source.id, source]));

      for await (const event of this.deps.stream(input, sources, signal)) {
        // Checked before every write. A client that closed the tab is the
        // reason the abort signal exists, and writing into a dead socket is
        // how a turn turns into an unhandled error.
        if (signal.aborted || sink.isClosed) return { status: 'aborted' };

        switch (event.type) {
          case 'segment':
            segments[event.segment] = { text: '', citations: [] };
            sink.send({ t: 'open', i: event.segment });
            break;

          case 'text':
            segments[event.segment] = segments[event.segment] ?? { text: '', citations: [] };
            segments[event.segment].text += event.text;
            sink.send({ t: 'text', i: event.segment, d: event.text });
            break;

          case 'citation': {
            // The check, before the chip reaches the client. A dropped citation
            // produces no event at all: the reader never sees a chip that would
            // have pointed somewhere else.
            const { kept, dropped: bad } = resolveCitations([event.citation], {
              sourceIds: sources.sourceIds,
              sources: byId,
              // Wrapped rather than passed by reference: `pageAt` is declared
              // as a method on TurnSources, and handing a method to another
              // object is how `this` quietly becomes something else.
              pageAt: (sourceId, offset) => sources.pageAt(sourceId, offset),
            });
            dropped.push(...bad);

            for (const citation of kept) {
              segments[event.segment] = segments[event.segment] ?? { text: '', citations: [] };
              segments[event.segment].citations.push(citation);
              sink.send({ t: 'cite', i: event.segment, c: citation });
            }
            break;
          }

          case 'done':
            finished = event.message;
            break;
        }
      }

      if (!finished) return { status: 'aborted' };

      for (const event of eventsForStopReason(finished.stop_reason)) sink.send(event);

      const trace = await this.deps.recordUsage(
        finished,
        Date.now() - started,
        input.notebookId
      );
      trace.droppedCitations = dropped.length;

      const answer = answerText(segments);

      // After the answer, not during it. The follow-ups are a second model call
      // on MODEL_FAST and must never delay the first token of the answer.
      const questions = await this.followUpsOrNone(input.question, answer, sources.sources);
      if (questions.length > 0) sink.send({ t: 'followups', q: questions });

      const usage = usageOf(finished);
      sink.send({ t: 'done', usage, trace });

      await this.deps.saveTurn(input.notebookId, {
        question: input.question,
        segments,
        droppedCitations: dropped.length,
        usage,
        trace,
      });

      return { status: 'done' };
    } catch (error) {
      if (signal.aborted) return { status: 'aborted' };

      // The real error goes to the log with its stack; the client gets one
      // sentence and a flag saying whether trying again could help.
      this.deps.onError(error, { notebookId: input.notebookId });
      sink.send(errorEvent(error));
      return { status: 'error' };
    }
  }

  /**
   * Follow-up questions are a convenience. A failure there must not cost the
   * answer that is already written and already on screen.
   */
  private async followUpsOrNone(
    question: string,
    answer: string,
    sources: CitableSource[]
  ): Promise<string[]> {
    try {
      return await this.deps.followUps({ question, answer, sources });
    } catch (error) {
      this.deps.onError(error, { notebookId: 'follow-ups' });
      return [];
    }
  }
}

function usageOf(message: Anthropic.Message): TurnUsage {
  const usage = message.usage;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite5m: usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
    cacheWrite1h: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
  };
}
