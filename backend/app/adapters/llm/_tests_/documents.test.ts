import { describe, expect, it } from '@jest/globals';

import { buildDocuments, sourceIdForDocumentIndex, type DocumentSource } from '../documents.js';

function source(overrides: Partial<DocumentSource> & Pick<DocumentSource, 'id' | 'position'>): DocumentSource {
  return {
    title: `Quelle ${overrides.position}`,
    kind: 'md',
    text: `Text von ${overrides.id}`,
    pageCount: null,
    ...overrides,
  };
}

describe('buildDocuments', () => {
  it('emits documents in position order, whatever order they arrive in', () => {
    const built = buildDocuments(
      [source({ id: 'c', position: 3 }), source({ id: 'a', position: 1 }), source({ id: 'b', position: 2 })],
      { citations: true }
    );

    expect(built.sourceIds).toEqual(['a', 'b', 'c']);
    expect(built.blocks.map((block) => block.title)).toEqual(['Quelle 1', 'Quelle 2', 'Quelle 3']);
  });

  it('breaks a tie on position by id, so the order is total and repeatable', () => {
    // Two sources at the same position must not swap between two requests: the
    // cached prefix would change and every document_index would shift with it.
    const first = buildDocuments([source({ id: 'z', position: 1 }), source({ id: 'a', position: 1 })], {
      citations: true,
    });
    const second = buildDocuments([source({ id: 'a', position: 1 }), source({ id: 'z', position: 1 })], {
      citations: true,
    });

    expect(first.sourceIds).toEqual(['a', 'z']);
    expect(second.sourceIds).toEqual(first.sourceIds);
  });

  it('sends the stored text unchanged', () => {
    const text = 'Zeile eins\n\nZeile zwei mit  zwei Leerzeichen';
    const built = buildDocuments([source({ id: 'a', position: 1, text })], { citations: true });

    const block = built.blocks[0];
    expect(block.source).toEqual({ type: 'text', media_type: 'text/plain', data: text });
  });

  it('carries source id, kind and page count in context', () => {
    const built = buildDocuments([source({ id: 'a', position: 1, kind: 'pdf', pageCount: 25 })], {
      citations: true,
    });

    expect(JSON.parse(built.blocks[0].context ?? '')).toEqual({
      sourceId: 'a',
      kind: 'pdf',
      pages: 25,
    });
  });

  it('reports pages as null for a format that has none', () => {
    const built = buildDocuments([source({ id: 'a', position: 1, kind: 'paste' })], { citations: true });
    expect(JSON.parse(built.blocks[0].context ?? '').pages).toBeNull();
  });

  it('puts a title on one line', () => {
    // A file name can carry a newline. The title is a field of the block, not
    // prose in the prompt, and it stays one line so it cannot look like structure.
    const built = buildDocuments([source({ id: 'a', position: 1, title: 'Bericht\nQ2   2026 ' })], {
      citations: true,
    });
    expect(built.blocks[0].title).toBe('Bericht Q2 2026');
  });

  it('turns citations on or off for every block at once', () => {
    const on = buildDocuments([source({ id: 'a', position: 1 }), source({ id: 'b', position: 2 })], {
      citations: true,
    });
    const off = buildDocuments([source({ id: 'a', position: 1 }), source({ id: 'b', position: 2 })], {
      citations: false,
    });

    expect(on.blocks.every((block) => block.citations?.enabled === true)).toBe(true);
    expect(off.blocks.every((block) => block.citations?.enabled === false)).toBe(true);
  });

  it('puts the cache breakpoint on the last block and nowhere else', () => {
    const built = buildDocuments(
      [source({ id: 'a', position: 1 }), source({ id: 'b', position: 2 }), source({ id: 'c', position: 3 })],
      { citations: true, cacheControl: { type: 'ephemeral', ttl: '1h' } }
    );

    expect(built.blocks[0].cache_control).toBeUndefined();
    expect(built.blocks[1].cache_control).toBeUndefined();
    expect(built.blocks[2].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('sets no breakpoint when none was asked for', () => {
    const built = buildDocuments([source({ id: 'a', position: 1 })], { citations: true });
    expect(built.blocks[0].cache_control).toBeUndefined();
  });

  it('handles an empty notebook without inventing a block', () => {
    const built = buildDocuments([], { citations: true, cacheControl: { type: 'ephemeral', ttl: '1h' } });
    expect(built.blocks).toEqual([]);
    expect(built.sourceIds).toEqual([]);
    expect(built.chars).toBe(0);
  });

  it('counts characters over all documents', () => {
    const built = buildDocuments(
      [source({ id: 'a', position: 1, text: '12345' }), source({ id: 'b', position: 2, text: '123' })],
      { citations: true }
    );
    expect(built.chars).toBe(8);
  });
});

describe('sourceIdForDocumentIndex', () => {
  it('maps an index to the source that produced that block', () => {
    const built = buildDocuments([source({ id: 'a', position: 1 }), source({ id: 'b', position: 2 })], {
      citations: true,
    });

    expect(sourceIdForDocumentIndex(built, 0)).toBe('a');
    expect(sourceIdForDocumentIndex(built, 1)).toBe('b');
  });

  it('returns null for an index outside the list instead of throwing', () => {
    // An out-of-range index is a citation to drop and log, not a reason to end
    // the stream: one bad chip must not cost the whole answer.
    const built = buildDocuments([source({ id: 'a', position: 1 })], { citations: true });

    expect(sourceIdForDocumentIndex(built, 1)).toBeNull();
    expect(sourceIdForDocumentIndex(built, -1)).toBeNull();
  });
});
