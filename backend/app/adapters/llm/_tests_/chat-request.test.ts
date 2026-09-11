/**
 * The chat request, and mostly its cache breakpoints.
 *
 * A wrong breakpoint does not throw and does not show up in an answer. It bills
 * 76,000 tokens again on every question and reports `cache_read_input_tokens: 0`
 * where nobody looks. That is why these are unit tests on the shape of the
 * request and not something left to a live run.
 */
import { describe, expect, it } from '@jest/globals';
import type Anthropic from '@anthropic-ai/sdk';

import { buildChatRequest, type ChatHistoryTurn } from '../chat-request.js';
import type { DocumentSource } from '../documents.js';

const sources: DocumentSource[] = [
  { id: 'a', position: 1, title: 'Eins', kind: 'md', text: 'erster Text' },
  { id: 'b', position: 2, title: 'Zwei', kind: 'pdf', text: 'zweiter Text', pageCount: 9 },
];

function build(overrides: Partial<Parameters<typeof buildChatRequest>[0]> = {}) {
  return buildChatRequest({
    model: 'claude-opus-5',
    system: 'Du antwortest nur aus den Dokumenten.',
    sources,
    tail: 'Question: Ab wann?',
    maxTokens: 4_000,
    ...overrides,
  });
}

function documentsOf(request: Anthropic.MessageCreateParamsStreaming) {
  const first = request.messages[0].content as Anthropic.ContentBlockParam[];
  return first.filter((block) => block.type === 'document');
}

describe('the cached prefix', () => {
  it('puts exactly one one-hour breakpoint on the last document', () => {
    const { request } = build();
    const documents = documentsOf(request);

    expect(documents[0].cache_control).toBeUndefined();
    expect(documents.at(-1)?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('puts nothing on the system block', () => {
    // A five minute breakpoint in front of a one hour one is the wrong order:
    // the shorter TTL would cap what the longer one can cache
    // (prompts/README.md, cache rule 2).
    const { request } = build();
    const system = request.system as Anthropic.TextBlockParam[];

    expect(system[0].cache_control).toBeUndefined();
  });

  it('has exactly one breakpoint in the whole request by default', () => {
    const { request } = build();
    const count = JSON.stringify(request).split('"cache_control"').length - 1;

    expect(count).toBe(1);
  });

  it('orders system, then documents, then the question', () => {
    // The stable part in front, everything that changes per turn behind it.
    const { request } = build();

    expect(request.system).toBeDefined();
    expect(documentsOf(request)).toHaveLength(2);
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'Question: Ab wann?' });
  });

  it('keeps the preferences out of the system block', () => {
    // Configure chat goes into the last user turn, never into the frozen
    // prefix, or every change would invalidate the cache for the notebook.
    const { request } = build({ tail: 'Style for this answer: Analyst.\n\nQuestion: Was?' });
    const system = JSON.stringify(request.system);

    expect(system).not.toContain('Analyst');
    expect(JSON.stringify(request.messages.at(-1))).toContain('Analyst');
  });
});

describe('citations', () => {
  it('are on for every document', () => {
    const { request } = build();
    expect(
      documentsOf(request).every((block) => block.citations?.enabled === true)
    ).toBe(true);
  });

  it('map an index back to the source that produced the block', () => {
    // `document_index` is zero-based over document blocks. The resolver maps
    // through this list, so its order is part of the contract.
    const { sourceIds } = build({ sources: [sources[1], sources[0]] });
    expect(sourceIds).toEqual(['a', 'b']);
  });
});

describe('thinking', () => {
  it('is adaptive and summarised, so the UI has something before the first token', () => {
    const { request } = build();
    expect(request.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });
});

describe('the effort', () => {
  it('is passed on a model that accepts it', () => {
    const { request } = build({ effort: 'low' });
    expect(request.output_config?.effort).toBe('low');
  });

  it('is dropped on the fast model, which rejects the parameter', () => {
    const { request } = build({ model: 'claude-haiku-4-5', effort: 'low' });
    expect(request.output_config?.effort).toBeUndefined();
  });
});

describe('the history breakpoint', () => {
  const history: ChatHistoryTurn[] = [
    { role: 'user', content: 'Erste Frage' },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'nachdenken', signature: 'sig' },
        { type: 'text', text: 'Erste Antwort.' },
      ] as Anthropic.ContentBlockParam[],
    },
  ];

  it('is absent unless it was asked for', () => {
    // Below the model's minimum prefix it does nothing, silently, and a
    // breakpoint that does nothing still uses one of the four slots.
    const { request } = build({ history });
    expect(JSON.stringify(request).split('"cache_control"').length - 1).toBe(1);
  });

  it('sits on the last text block of the last assistant turn', () => {
    const { request } = build({ history, cacheHistory: true });
    const assistant = request.messages.find((turn) => turn.role === 'assistant');
    const blocks = assistant?.content as Anthropic.ContentBlockParam[];

    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('never sits on a thinking block', () => {
    // A thinking block cannot carry cache_control and the API rejects a request
    // where one does. TypeScript refuses it too, which is why the code narrows
    // to a text block instead of spreading the union.
    const { request } = build({ history, cacheHistory: true });
    const assistant = request.messages.find((turn) => turn.role === 'assistant');
    const blocks = assistant?.content as Anthropic.ContentBlockParam[];

    expect(blocks[0].type).toBe('thinking');
    expect(blocks[0].cache_control).toBeUndefined();
  });

  it('is five minutes, never an hour', () => {
    // The hour belongs to the documents. History is cheap to lose and changes
    // every turn anyway.
    const { request } = build({ history, cacheHistory: true });
    const assistant = request.messages.find((turn) => turn.role === 'assistant');
    const blocks = assistant?.content as Anthropic.ContentBlockParam[];

    expect(blocks[1].cache_control).not.toHaveProperty('ttl');
  });

  it('leaves a history with no assistant text alone', () => {
    const thinkingOnly: ChatHistoryTurn[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'nur nachdenken', signature: 'sig' },
        ] as Anthropic.ContentBlockParam[],
      },
    ];

    const { request } = build({ history: thinkingOnly, cacheHistory: true });
    expect(JSON.stringify(request).split('"cache_control"').length - 1).toBe(1);
  });

  it('replays an assistant turn with the blocks it had', () => {
    // Thinking blocks with their signature, text blocks with their citations.
    // Replayed cited_text is not billed again (prompts/README.md, rule 5).
    const withCitation: ChatHistoryTurn[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Ab dem 2. August 2026.',
            citations: [
              {
                type: 'char_location',
                cited_text: 'Sie gilt ab dem 2. August 2026.',
                document_index: 0,
                document_title: 'Eins',
                start_char_index: 10,
                end_char_index: 41,
              },
            ],
          },
        ] as Anthropic.ContentBlockParam[],
      },
    ];

    const { request } = build({ history: withCitation });
    const assistant = request.messages.find((turn) => turn.role === 'assistant');
    const blocks = assistant?.content as Anthropic.TextBlockParam[];

    expect(blocks[0].citations).toHaveLength(1);
  });
});

describe('an empty notebook', () => {
  it('sends no turn at all rather than an empty one', () => {
    // A turn whose content is an empty array is a 400 from the API, and a
    // notebook exists before its first source. The answer to a question there
    // is a refusal, which is a good answer.
    const { request, sourceIds } = build({ sources: [] });

    expect(sourceIds).toEqual([]);
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]).toEqual({ role: 'user', content: 'Question: Ab wann?' });
  });

  it('carries no cache breakpoint, because there is no prefix to cache', () => {
    const { request } = build({ sources: [] });
    expect(JSON.stringify(request)).not.toContain('cache_control');
  });

  it('still sends the history when there is one', () => {
    const { request } = build({
      sources: [],
      history: [{ role: 'user', content: 'Frueher' }],
    });

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]).toEqual({ role: 'user', content: 'Frueher' });
  });
});

describe('streaming', () => {
  it('is on, because the route answers over SSE', () => {
    const { request } = build();
    expect(request.stream).toBe(true);
  });
});
