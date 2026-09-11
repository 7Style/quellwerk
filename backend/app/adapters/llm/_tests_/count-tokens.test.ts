import { describe, expect, it, jest } from '@jest/globals';

import { buildCountTokensRequest, countChatTokens } from '../count-tokens.js';
import type { DocumentSource } from '../documents.js';

const sources: DocumentSource[] = [
  { id: 'b', position: 2, title: 'Zwei', kind: 'md', text: 'zweiter Text' },
  { id: 'a', position: 1, title: 'Eins', kind: 'pdf', text: 'erster Text', pageCount: 3 },
];

describe('buildCountTokensRequest', () => {
  it('sends the documents in one user turn, in position order', () => {
    const request = buildCountTokensRequest({ model: 'claude-opus-5', sources });

    expect(request.messages).toHaveLength(1);
    const content = request.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as Array<{ title?: string }>).map((block) => block.title)).toEqual(['Eins', 'Zwei']);
  });

  it('carries no max_tokens, because the count endpoint has no such field', () => {
    // The count endpoint's body schema is not the create endpoint's. Reusing a
    // MessageCreateParams here would send a field the endpoint does not know.
    const request = buildCountTokensRequest({ model: 'claude-opus-5', sources });
    expect(request).not.toHaveProperty('max_tokens');
  });

  it('sets no cache breakpoint', () => {
    // Counting is not a turn. `cache_control` is accepted by the endpoint but
    // never caches anything, so a breakpoint here would be decoration.
    const request = buildCountTokensRequest({ model: 'claude-opus-5', sources });
    const content = request.messages[0].content as Array<{ cache_control?: unknown }>;
    expect(content.every((block) => block.cache_control === undefined)).toBe(true);
  });

  it('leaves citations off, because they do not change how text tokenises', () => {
    const request = buildCountTokensRequest({ model: 'claude-opus-5', sources });
    const content = request.messages[0].content as Array<{ citations?: { enabled: boolean } }>;
    expect(content.every((block) => block.citations?.enabled === false)).toBe(true);
  });

  it('includes the system prompt only when there is one', () => {
    expect(buildCountTokensRequest({ model: 'm', sources }).system).toBeUndefined();
    expect(buildCountTokensRequest({ model: 'm', sources, system: 'Du bist...' }).system).toBe(
      'Du bist...'
    );
  });

  it('still produces a valid request for an empty notebook', () => {
    // Zero sources is a real state: a notebook exists before its first source.
    // The endpoint needs at least one user turn, so the request must not be
    // empty just because there is nothing to count yet.
    const request = buildCountTokensRequest({ model: 'claude-opus-5', sources: [] });

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content).toBe(' ');
  });

  it('appends the documents after any messages it was given', () => {
    const request = buildCountTokensRequest({
      model: 'claude-opus-5',
      sources,
      messages: [{ role: 'user', content: 'eine frühere Frage' }],
    });

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].content).toBe('eine frühere Frage');
  });
});

describe('countChatTokens', () => {
  it('returns what the counter reports, without touching the number', () => {
    const counter = { countTokens: jest.fn<() => Promise<number>>().mockResolvedValue(42_137) };

    return expect(countChatTokens(counter, { model: 'claude-opus-5', sources })).resolves.toBe(42_137);
  });

  it('hands the counter the built request', async () => {
    const counter = { countTokens: jest.fn<() => Promise<number>>().mockResolvedValue(1) };
    await countChatTokens(counter, { model: 'claude-opus-5', sources });

    expect(counter.countTokens).toHaveBeenCalledTimes(1);
    const request = counter.countTokens.mock.calls[0][0] as { model: string };
    expect(request.model).toBe('claude-opus-5');
  });
});
