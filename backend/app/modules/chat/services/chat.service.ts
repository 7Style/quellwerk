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
import { beginsWithRefusal } from '../internal/refusal.js';
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
  /**
   * True for the demo notebook, which every visitor may read.
   *
   * A turn in a shared notebook is a turn without a memory: no history is
   * replayed into it and nothing is written back. Both directions matter. One
   * visitor's question must not reach another visitor's prompt, and a notebook
   * everyone can write to is a notebook whose history is written by strangers.
   * Copy-on-first-write gives each visitor their own copy in M7; until then the
   * original stays as it was seeded.
   */
  shared: boolean;
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
  followUps(
    input: { question: string; answer: string; sources: CitableSource[] },
    signal: AbortSignal
  ): Promise<string[]>;
  /** Prices the call and writes the usage row. Returns the cost. */
  recordUsage(message: Anthropic.Message, latencyMs: number, notebookId: string): Promise<TurnTrace>;
  saveTurn(notebookId: string, turn: StoredTurn): Promise<void>;
  onError(error: unknown, context: { notebookId: string }): void;
  /**
   * One line per citation that did not survive the check.
   *
   * CLAUDE.md requires it, and not for tidiness: the slice comparison is the
   * claim the whole product rests on, and without this line a systematic offset
   * drift - say after a change to normalisation - shows up in production as a
   * number in the trace panel and nowhere else. Offsets and lengths only; the
   * cited text and the slice are both source content.
   */
  onDroppedCitations(dropped: DroppedCitation[], context: { notebookId: string }): void;
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
      let refusedCitations = 0;
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
            // A refusal carries no chip (docs/SPEC.md). The prompt says so and
            // the model has obeyed it in every measured run, but "the sources do
            // not cover this" with a citation under it is the one contradiction
            // this product cannot show, so it is refused here as well. The
            // refusal sentence is the first sentence, so by the time any
            // citation arrives the answer already says whether it is one.
            if (beginsWithRefusal(answerText(segments))) {
              refusedCitations += 1;
              break;
            }

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

      if (dropped.length > 0) this.deps.onDroppedCitations(dropped, { notebookId: input.notebookId });
      if (refusedCitations > 0) {
        // Worth seeing: it means the prompt stopped holding, and the eval's
        // `citedWhileRefusing` would not catch it on a question nobody asked.
        this.deps.onError(
          new Error(`a refusal carried ${refusedCitations} citation(s), all suppressed`),
          { notebookId: input.notebookId }
        );
      }

      if (!finished) {
        // The upstream ended without a final message. Something has to reach the
        // client here: SPEC rules out a spinner that never stops, and a socket
        // that simply closes is exactly that if the reader's connection is fine.
        if (!sink.isClosed && !signal.aborted) {
          sink.send({ t: 'error', m: 'The answer stopped unexpectedly. Try again.', retry: true });
        }
        return { status: 'aborted' };
      }

      for (const event of eventsForStopReason(finished.stop_reason)) sink.send(event);

      const trace = await this.deps.recordUsage(
        finished,
        Date.now() - started,
        input.notebookId
      );
      trace.droppedCitations = dropped.length;

      const answer = answerText(segments);
      const usage = usageOf(finished);

      // `done` first, then the follow-ups. They are a second model call on
      // MODEL_FAST, and a turn that holds `done` back until it returns is a turn
      // whose answer is complete on screen while the spinner keeps going. The
      // client treats `followups` as an event that may or may not arrive.
      sink.send({ t: 'done', usage, trace });

      const questions = await this.followUpsOrNone(
        input.question,
        answer,
        sources.sources,
        signal
      );
      if (questions.length > 0 && !sink.isClosed) sink.send({ t: 'followups', q: questions });

      // Not in a shared notebook. Writing there would put this visitor's
      // question into the next visitor's history (TurnSources.shared).
      if (!sources.shared) {
        await this.deps.saveTurn(input.notebookId, {
          question: input.question,
          segments,
          droppedCitations: dropped.length,
          usage,
          trace,
        });
      }

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
    sources: CitableSource[],
    signal: AbortSignal
  ): Promise<string[]> {
    try {
      return await this.deps.followUps({ question, answer, sources }, signal);
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
