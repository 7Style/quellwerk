/**
 * The SSE writer and the turn it carries.
 *
 * Two halves: the wire format and the headers that decide whether a stream
 * survives a proxy, and the order of events in a turn. The second half runs the
 * real service against a fake model, because "the citation goes out only after
 * it was checked" is an ordering claim and ordering is exactly what a mock can
 * show.
 */
import { describe, expect, it, jest } from '@jest/globals';
import type Anthropic from '@anthropic-ai/sdk';

import {
  errorEvent,
  eventsForStopReason,
  SseStream,
  type ChatEvent,
  type SseTarget,
} from '../stream.js';
import { ChatService, type StreamEvent, type TurnSources } from '../../services/chat.service.js';
import type { CitableSource } from '../citations.js';

/** A response that remembers everything instead of writing it to a socket. */
function target(): SseTarget & { headers: Record<string, string>; chunks: string[] } {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  return {
    headers,
    chunks,
    writableEnded: false,
    setHeader: (name, value) => {
      headers[name] = value;
    },
    write: (chunk) => {
      chunks.push(chunk);
      return true;
    },
    end() {
      (this as { writableEnded: boolean }).writableEnded = true;
    },
  };
}

describe('the headers', () => {
  it('say event stream, no cache, no transform', () => {
    const out = target();
    new SseStream(out).open();

    expect(out.headers['Content-Type']).toContain('text/event-stream');
    expect(out.headers['Cache-Control']).toContain('no-cache');
    expect(out.headers['Cache-Control']).toContain('no-transform');
  });

  it('tell nginx not to buffer', () => {
    // The one header that is not part of SSE and the one that decides whether
    // this works behind the host nginx. Without it the proxy collects the whole
    // answer and delivers it at once.
    const out = target();
    new SseStream(out).open();

    expect(out.headers['X-Accel-Buffering']).toBe('no');
  });
});

describe('the wire format', () => {
  it('writes one data line per event, separated by a blank line', () => {
    const out = target();
    const stream = new SseStream(out);
    stream.open();
    stream.send({ t: 'text', i: 0, d: 'Hallo' });

    expect(out.chunks.at(-1)).toBe('data: {"t":"text","i":0,"d":"Hallo"}\n\n');
  });

  it('sends a heartbeat comment while the stream is open', () => {
    jest.useFakeTimers();
    try {
      const out = target();
      const stream = new SseStream(out, 100);
      stream.open();

      jest.advanceTimersByTime(250);
      expect(out.chunks.filter((chunk) => chunk === ': ping\n\n')).toHaveLength(2);

      stream.close();
      jest.advanceTimersByTime(500);
      expect(out.chunks.filter((chunk) => chunk === ': ping\n\n')).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes nothing after it was closed', () => {
    const out = target();
    const stream = new SseStream(out);
    stream.open();
    stream.close();
    stream.send({ t: 'text', i: 0, d: 'zu spaet' });

    expect(out.chunks.join('')).not.toContain('zu spaet');
  });

  it('can be closed twice', () => {
    // The error path and the normal path both end here, and on an aborted
    // request that is the usual case rather than the exception.
    const out = target();
    const stream = new SseStream(out);
    stream.open();

    expect(() => {
      stream.close();
      stream.close();
    }).not.toThrow();
  });
});

describe('stop_reason', () => {
  it('adds nothing for a normal end', () => {
    expect(eventsForStopReason('end_turn')).toEqual([]);
  });

  it('says so when the answer hit the token limit', () => {
    // The difference between a bug report and a known limit.
    expect(eventsForStopReason('max_tokens')).toEqual([{ t: 'truncated' }]);
  });

  it('keeps a model refusal apart from the product refusal', () => {
    // "The sources do not cover this" is an answer. A model declining is not,
    // and showing one as the other would be a lie about the sources.
    const [event] = eventsForStopReason('refusal');
    expect(event.t).toBe('refused');
    expect((event as { m: string }).m).toContain('not the same as the sources');
  });
});

describe('an error event', () => {
  it('offers a retry for an overloaded model', () => {
    expect(errorEvent({ status: 529 })).toMatchObject({ t: 'error', retry: true });
    expect(errorEvent({ status: 429 })).toMatchObject({ retry: true });
  });

  it('offers none when the spend limit at Anthropic is reached', () => {
    // A button that cannot work is worse than a sentence that says so. Anthropic
    // reports this as a 4xx with a billing error, not as a 503; a 503 arriving
    // mid-stream is the model service having a bad minute and is worth retrying.
    const spent = {
      status: 400,
      error: { error: { type: 'billing_error', message: 'Your credit balance is too low' } },
    };

    expect(errorEvent(spent)).toMatchObject({ m: 'Das Tagesbudget der Demo ist erreicht.', retry: false });
    expect(errorEvent({ status: 503 })).toMatchObject({ retry: true });
  });

  it('offers none for a request we built wrong', () => {
    expect(errorEvent({ status: 400 })).toMatchObject({ retry: false });
  });

  it('never carries the upstream message', () => {
    // It can contain the request, and the request contains the documents.
    const leaky = Object.assign(new Error('invalid_request: messages.0.content[3].text "Sie gilt ab dem"'), {
      status: 400,
    });
    expect(JSON.stringify(errorEvent(leaky))).not.toContain('Sie gilt');
  });
});

/* -------------------------------------------------------------------------- */
/* The turn                                                                    */
/* -------------------------------------------------------------------------- */

const TEXT = 'Sie gilt ab dem 2. August 2026. Kapitel I frueher.';
const source: CitableSource = { id: 'src-1', title: 'Verordnung', text: TEXT };

const sources: TurnSources = {
  sources: [source],
  sourceIds: ['src-1'],
  pageAt: () => 3,
  shared: false,
};

function goodCitation(): Anthropic.TextCitation {
  return {
    type: 'char_location',
    cited_text: 'Sie gilt ab dem 2. August 2026.',
    document_index: 0,
    document_title: 'Verordnung',
    start_char_index: 0,
    end_char_index: 31,
  } as Anthropic.TextCitation;
}

function finishedMessage(stopReason = 'end_turn'): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 12,
      output_tokens: 34,
      cache_read_input_tokens: 76_000,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

function collector() {
  const events: ChatEvent[] = [];
  return {
    events,
    sink: {
      send: (event: ChatEvent) => {
        events.push(event);
      },
      get isClosed() {
        return false;
      },
    },
  };
}

/**
 * An upstream that fails on the first pull.
 *
 * Not a generator with a `throw` in it: TypeScript then wants a `yield` it can
 * never reach and ESLint wants a `yield` at all, and satisfying both leaves a
 * dead line in a test file where a dead line is indistinguishable from an
 * assertion that never runs. An explicit iterator says the same thing once.
 */
function failingStream(fail: () => Error): () => AsyncIterable<StreamEvent> {
  return () => ({
    [Symbol.asyncIterator]: (): AsyncIterator<StreamEvent> => ({
      next: () => Promise.reject(fail()),
    }),
  });
}

function serviceWith(
  stream: StreamEvent[] | (() => AsyncIterable<StreamEvent>),
  overrides: Partial<ConstructorParameters<typeof ChatService>[0]> = {}
) {
  const saved: unknown[] = [];
  const errors: unknown[] = [];
  const droppedLog: unknown[] = [];
  const billed: Anthropic.Message[] = [];

  const service = new ChatService({
    loadSources: async () => sources,
    stream: typeof stream === 'function'
      ? stream
      : async function* () {
          for (const event of stream) yield event;
        },
    followUps: async () => ['Und dann?', 'Warum?', 'Fuer wen?'],
    recordUsage: async (message) => {
      billed.push(message);
      return {
        model: 'claude-opus-5',
        effort: 'low',
        latencyMs: 1_234,
        costMicroCents: 5_000,
        droppedCitations: 0,
        stopReason: 'end_turn',
      };
    },
    saveTurn: async (_id, turn) => {
      saved.push(turn);
      // Die Id, die `done` mitnimmt: an ihr findet "Save to note" die Antwort
      // wieder (M5-T4).
      return { messageId: `msg-${saved.length}` };
    },
    onDroppedCitations: (entries) => {
      droppedLog.push(...entries);
    },
    onError: (error) => {
      errors.push(error);
    },
    ...overrides,
  });

  return { service, saved, errors, droppedLog, billed };
}

const request = { notebookId: 'nb-1', sessionId: 'session-a', question: 'Ab wann?' };

describe('a turn', () => {
  it('sends its events in the order the contract names', async () => {
    const { service } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'text', segment: 0, text: 'Sie gilt ' },
      { type: 'text', segment: 0, text: 'ab 2026.' },
      { type: 'citation', segment: 0, citation: goodCitation() },
      { type: 'done', message: finishedMessage() },
    ]);

    const { events, sink } = collector();
    const result = await service.run(request, sink, new AbortController().signal);

    expect(result.status).toBe('done');
    // `done` before `followups`, not after. The follow-ups are a second model
    // call, and holding `done` until it returns leaves a finished answer on
    // screen under a spinner that is still turning.
    expect(events.map((event) => event.t)).toEqual([
      'open',
      'text',
      'text',
      'cite',
      'done',
      'followups',
    ]);
  });

  it('sends a citation only after it passed the check', async () => {
    // The ordering claim that matters. A chip that reached the client before
    // the check would already be on screen when it turned out to be wrong.
    const { service } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'citation', segment: 0, citation: goodCitation() },
      { type: 'done', message: finishedMessage() },
    ]);

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    const cite = events.find((event) => event.t === 'cite');
    expect(cite).toMatchObject({ i: 0, c: { sourceId: 'src-1', page: 3 } });
  });

  it('sends no event at all for a citation that failed the check', async () => {
    const wrong = { ...goodCitation(), cited_text: 'Etwas ganz anderes.' };
    const { service, saved } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'text', segment: 0, text: 'Behauptung.' },
      { type: 'citation', segment: 0, citation: wrong },
      { type: 'done', message: finishedMessage() },
    ]);

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    expect(events.some((event) => event.t === 'cite')).toBe(false);
    // The text still goes out. One bad chip does not cost the answer.
    expect(events.some((event) => event.t === 'text')).toBe(true);
    expect((saved[0] as { droppedCitations: number }).droppedCitations).toBe(1);
  });

  it('sends no chip under a refusal, even when the model attached one', async () => {
    // docs/SPEC.md: "Eine Ablehnung traegt keinen einzigen Chip". The prompt
    // asks for it; this is the route refusing to render it anyway.
    const { service, saved } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'text', segment: 0, text: 'Die Quellen enthalten dazu keine Informationen.' },
      { type: 'citation', segment: 0, citation: goodCitation() },
      { type: 'done', message: finishedMessage() },
    ]);

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    expect(events.some((event) => event.t === 'cite')).toBe(false);
    const stored = saved[0] as { segments: Array<{ citations: unknown[] }> };
    expect(stored.segments[0].citations).toEqual([]);
  });

  it('logs a dropped citation with offsets and lengths, never with its text', async () => {
    // CLAUDE.md: mismatch = drop AND log. Without this line a systematic offset
    // drift is a number in a panel and nothing a person could debug.
    const { service, droppedLog } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'text', segment: 0, text: 'Sie gilt ab 2026.' },
      { type: 'citation', segment: 0, citation: { ...goodCitation(), cited_text: 'Etwas anderes.' } },
      { type: 'done', message: finishedMessage() },
    ]);

    const { sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    expect(droppedLog).toHaveLength(1);
    const entry = droppedLog[0] as Record<string, unknown>;
    expect(entry).toMatchObject({ reason: 'mismatch', sourceId: 'src-1' });
    expect(Object.keys(entry).sort()).toEqual(
      ['citedLength', 'documentIndex', 'end', 'reason', 'sliceLength', 'sourceId', 'start'].sort()
    );
    expect(JSON.stringify(droppedLog)).not.toContain('Etwas anderes');
    expect(JSON.stringify(droppedLog)).not.toContain('Sie gilt');
  });

  it('counts the dropped citations into the trace the panel shows', async () => {
    const wrong = { ...goodCitation(), document_index: 9 } as Anthropic.TextCitation;
    const { service } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'citation', segment: 0, citation: wrong },
      { type: 'done', message: finishedMessage() },
    ]);

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    const done = events.find((event) => event.t === 'done') as { trace: { droppedCitations: number } };
    expect(done.trace.droppedCitations).toBe(1);
  });

  it('adds truncated before done when the answer hit the limit', async () => {
    const { service } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'text', segment: 0, text: 'Der Satz bricht' },
      { type: 'done', message: finishedMessage('max_tokens') },
    ]);

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    const kinds = events.map((event) => event.t);
    expect(kinds.indexOf('truncated')).toBeLessThan(kinds.indexOf('done'));
  });
});

describe('an aborted request', () => {
  it('stops the turn instead of finishing it', async () => {
    // A browser that closed the tab. Carrying on bills tokens for an answer
    // nobody will read.
    const controller = new AbortController();
    const { service, saved } = serviceWith(async function* () {
      yield { type: 'segment', segment: 0 };
      yield { type: 'text', segment: 0, text: 'Anfang' };
      controller.abort();
      yield { type: 'text', segment: 0, text: 'wird nicht mehr gesendet' };
      yield { type: 'done', message: finishedMessage() };
    });

    const { events, sink } = collector();
    const result = await service.run(request, sink, controller.signal);

    expect(result.status).toBe('aborted');
    expect(events.some((event) => event.t === 'done')).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('is still billed for what the model already read', async () => {
    // The prefix - up to 150,000 tokens of documents - is paid the moment the
    // model starts. A turn that walks away without a usage_log row is money the
    // daily budget never sees, and sixty of those an hour is a counter that
    // does not move while the bill does (SECURITY.md 7.3).
    const controller = new AbortController();
    const { service, billed } = serviceWith(async function* () {
      yield { type: 'started', usage: { input_tokens: 76_000, output_tokens: 0 } } as never;
      yield { type: 'segment', segment: 0 };
      yield { type: 'text', segment: 0, text: 'Sie gilt' };
      controller.abort();
      yield { type: 'text', segment: 0, text: ' ab 2026.' };
    });

    const { sink } = collector();
    const result = await service.run(request, sink, controller.signal);

    expect(result.status).toBe('aborted');
    expect(billed).toHaveLength(1);
    expect(billed[0].usage.input_tokens).toBe(76_000);
  });

  it('bills nothing when the model never started', async () => {
    // No first frame, nothing read, nothing owed. A row here would be a charge
    // invented by the client.
    const controller = new AbortController();
    const { service, billed } = serviceWith(
      failingStream(() => {
        controller.abort();
        return Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
      })
    );

    const { sink } = collector();
    await service.run(request, sink, controller.signal);

    expect(billed).toHaveLength(0);
  });

  it('is not reported as an error', async () => {
    const controller = new AbortController();
    const { service, errors } = serviceWith(
      failingStream(() => {
        controller.abort();
        // The SDK throws on an aborted stream; that is expected, not a failure.
        return Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
      })
    );

    const { events, sink } = collector();
    const result = await service.run(request, sink, controller.signal);

    expect(result.status).toBe('aborted');
    expect(errors).toEqual([]);
    expect(events.some((event) => event.t === 'error')).toBe(false);
  });
});

describe('an upstream error', () => {
  it('emits exactly one error event', async () => {
    const { service } = serviceWith(async function* () {
      yield { type: 'segment', segment: 0 };
      throw Object.assign(new Error('overloaded'), { status: 529 });
    });

    const { events, sink } = collector();
    const result = await service.run(request, sink, new AbortController().signal);

    expect(result.status).toBe('error');
    expect(events.filter((event) => event.t === 'error')).toHaveLength(1);
    expect(events.some((event) => event.t === 'done')).toBe(false);
  });

  it('goes to the log with its stack, not to the client', async () => {
    const boom = Object.assign(new Error('upstream said something detailed'), { status: 500 });
    const { service, errors } = serviceWith(failingStream(() => boom));

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    expect(errors).toEqual([boom]);
    expect(JSON.stringify(events)).not.toContain('something detailed');
  });

  it('saves nothing, because there is no answer to save', async () => {
    const { service, saved } = serviceWith(failingStream(() => new Error('kaputt')));

    const { sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    expect(saved).toEqual([]);
  });
});

describe('the follow-up questions', () => {
  it('come after the answer, never before it', async () => {
    // A second model call on MODEL_FAST. It must never delay the first token.
    const { service } = serviceWith([
      { type: 'segment', segment: 0 },
      { type: 'text', segment: 0, text: 'Antwort.' },
      { type: 'done', message: finishedMessage() },
    ]);

    const { events, sink } = collector();
    await service.run(request, sink, new AbortController().signal);

    const kinds = events.map((event) => event.t);
    expect(kinds.indexOf('text')).toBeLessThan(kinds.indexOf('followups'));
  });

  it('do not cost the answer when they fail', async () => {
    // They are a convenience. The answer is already written and on screen.
    const { service } = serviceWith(
      [
        { type: 'segment', segment: 0 },
        { type: 'text', segment: 0, text: 'Antwort.' },
        { type: 'done', message: finishedMessage() },
      ],
      { followUps: () => Promise.reject(new Error('fast model down')) }
    );

    const { events, sink } = collector();
    const result = await service.run(request, sink, new AbortController().signal);

    expect(result.status).toBe('done');
    expect(events.some((event) => event.t === 'followups')).toBe(false);
    expect(events.some((event) => event.t === 'done')).toBe(true);
  });
});
