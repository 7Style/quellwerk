/**
 * The citation check.
 *
 * Everything Quellwerk claims comes down to this file: a chip points at exactly
 * the characters it says it points at, or it does not exist. The tests below are
 * mostly about the second half - what happens when a citation is wrong - because
 * that is the half a demo never shows and a reviewer will look for.
 */
import { describe, expect, it } from '@jest/globals';
import type Anthropic from '@anthropic-ai/sdk';

import {
  answerText,
  resolveAnswer,
  resolveCitations,
  type CitableSource,
} from '../citations.js';
import { beginsWithRefusal } from '../refusal.js';

const TEXT = 'Artikel 113\nSie gilt ab dem 2. August 2026.\nJedoch gilt Kapitel I frueher.';

const source: CitableSource = { id: 'src-1', title: 'Verordnung', text: TEXT };
const sources = new Map([[source.id, source]]);
const sourceIds = ['src-1'];

/** A citation that is true: the offsets really hold that text. */
function citation(overrides: Partial<Anthropic.CitationCharLocation> = {}): Anthropic.CitationCharLocation {
  const start = TEXT.indexOf('Sie gilt ab dem 2. August 2026.');
  return {
    type: 'char_location',
    cited_text: 'Sie gilt ab dem 2. August 2026.',
    document_index: 0,
    document_title: 'Verordnung',
    start_char_index: start,
    end_char_index: start + 'Sie gilt ab dem 2. August 2026.'.length,
    ...overrides,
  } as Anthropic.CitationCharLocation;
}

describe('a citation that matches its source', () => {
  it('is kept', () => {
    const { kept, dropped } = resolveCitations([citation()], { sourceIds, sources });

    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      sourceId: 'src-1',
      sourceTitle: 'Verordnung',
      text: 'Sie gilt ab dem 2. August 2026.',
    });
  });

  it('carries the slice, not the text the model sent', () => {
    // They are equal by the check. Taking the slice keeps the stored text the
    // single source of truth even if that ever stops being so.
    const { kept } = resolveCitations([citation()], { sourceIds, sources });
    expect(TEXT.slice(kept[0].start, kept[0].end)).toBe(kept[0].text);
  });

  it('gets its page when the source has one', () => {
    const { kept } = resolveCitations([citation()], {
      sourceIds,
      sources,
      pageAt: () => 14,
    });
    expect(kept[0].page).toBe(14);
  });

  it('gets a null page for a source without pages', () => {
    // A pasted note has no pages. Inventing "page 1" would put a number in the
    // hover that means nothing.
    const { kept } = resolveCitations([citation()], { sourceIds, sources });
    expect(kept[0].page).toBeNull();
  });
});

describe('a citation whose offsets are off by one', () => {
  it('is dropped', () => {
    // The realistic failure. Everything looks right, the text is nearly the
    // same, and the highlight would sit one character to the left for ever.
    const shifted = citation({
      start_char_index: citation().start_char_index + 1,
      end_char_index: citation().end_char_index + 1,
    });

    const { kept, dropped } = resolveCitations([shifted], { sourceIds, sources });

    expect(kept).toEqual([]);
    expect(dropped[0].reason).toBe('mismatch');
  });

  it('is logged with lengths only, never with the text', () => {
    // Source text never reaches logs, error responses or usage_log (CLAUDE.md).
    // The dropped record is what gets logged, so its shape is the guarantee.
    const shifted = citation({ start_char_index: 0, end_char_index: 31 });
    const { dropped } = resolveCitations([shifted], { sourceIds, sources });

    expect(Object.keys(dropped[0]).sort()).toEqual([
      'citedLength',
      'documentIndex',
      'end',
      'reason',
      'sliceLength',
      'sourceId',
      'start',
    ]);
    expect(JSON.stringify(dropped[0])).not.toContain('August');
    expect(JSON.stringify(dropped[0])).not.toContain('Artikel');
  });

  it('records both lengths, so a shift is visible from the log alone', () => {
    const shifted = citation({ end_char_index: citation().end_char_index - 5 });
    const { dropped } = resolveCitations([shifted], { sourceIds, sources });

    expect(dropped[0].citedLength).toBe(31);
    expect(dropped[0].sliceLength).toBe(26);
  });
});

describe('a citation that cannot be checked', () => {
  it('is dropped when the document index is outside the list', () => {
    const { kept, dropped } = resolveCitations([citation({ document_index: 7 })], {
      sourceIds,
      sources,
    });

    expect(kept).toEqual([]);
    expect(dropped[0]).toMatchObject({ reason: 'unknown-document', documentIndex: 7, sourceId: null });
  });

  it('is dropped when the range runs past the end of the text', () => {
    const { dropped } = resolveCitations(
      [citation({ start_char_index: 10, end_char_index: 10_000 })],
      { sourceIds, sources }
    );

    expect(dropped[0].reason).toBe('out-of-range');
    expect(dropped[0].sliceLength).toBeNull();
  });

  it('is dropped when start and end are the same', () => {
    const { dropped } = resolveCitations(
      [citation({ start_char_index: 5, end_char_index: 5 })],
      { sourceIds, sources }
    );
    expect(dropped[0].reason).toBe('out-of-range');
  });

  it('is dropped when it is not a character location', () => {
    // Only char_location carries offsets into a text document, and text is the
    // only form Quellwerk sends (ADR-0010). A page location would make the
    // viewer mark something it cannot resolve to characters.
    const pageLocation = {
      type: 'page_location',
      cited_text: 'egal',
      document_index: 0,
      document_title: 'Verordnung',
      start_page_number: 1,
      end_page_number: 2,
    } as unknown as Anthropic.TextCitation;

    const { kept, dropped } = resolveCitations([pageLocation], { sourceIds, sources });

    expect(kept).toEqual([]);
    expect(dropped[0].reason).toBe('unsupported-location');
  });
});

describe('one bad citation among good ones', () => {
  it('costs only itself', () => {
    // A single wrong chip must not cost the whole answer. The other two are
    // still true and still useful.
    const good = citation();
    const bad = citation({ cited_text: 'Etwas, das dort nicht steht.' });

    const { kept, dropped } = resolveCitations([good, bad, good], { sourceIds, sources });

    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(1);
  });
});

describe('a whole answer', () => {
  const content = [
    { type: 'thinking', thinking: 'nachdenken', signature: 'sig' },
    { type: 'text', text: 'Die Verordnung gilt ab dem 2. August 2026.', citations: [citation()] },
    { type: 'text', text: 'Kapitel I gilt frueher.', citations: [] },
  ] as unknown as Anthropic.ContentBlock[];

  it('keeps one segment per text block, in order', () => {
    const answer = resolveAnswer(content, { sourceIds, sources });

    expect(answer.segments).toHaveLength(2);
    expect(answer.segments[0].citations).toHaveLength(1);
    expect(answer.segments[1].citations).toEqual([]);
  });

  it('skips thinking blocks', () => {
    // What the model thought is not what it claimed, and thinking carries no
    // citations to check.
    const answer = resolveAnswer(content, { sourceIds, sources });
    expect(answer.segments.map((segment) => segment.text)).not.toContain('nachdenken');
  });

  it('counts the dropped citations across all of its blocks', () => {
    const broken = [
      { type: 'text', text: 'Eins.', citations: [citation({ document_index: 9 })] },
      { type: 'text', text: 'Zwei.', citations: [citation({ cited_text: 'falsch' })] },
    ] as unknown as Anthropic.ContentBlock[];

    const answer = resolveAnswer(broken, { sourceIds, sources });

    expect(answer.droppedCitations).toHaveLength(2);
    expect(answer.segments.every((segment) => segment.citations.length === 0)).toBe(true);
  });
});

describe('a refusal', () => {
  it('is recognised in both languages, word for word', () => {
    expect(beginsWithRefusal('Die Quellen enthalten dazu keine Informationen.')).toBe(true);
    expect(beginsWithRefusal('The sources do not cover this.')).toBe(true);
  });

  it('is still a refusal with the sentences that may follow it', () => {
    // The prompt allows one or two sentences on what the documents do cover.
    // They are part of the refusal, and none of them may carry a chip.
    expect(
      beginsWithRefusal('The sources do not cover this. They do describe what a notified body is.')
    ).toBe(true);
  });

  it('is not recognised when the sentence is softened or moved', () => {
    // Exact, and only at the start. A near miss is a real answer, and stripping
    // its citations would be the wrong call.
    expect(beginsWithRefusal('Leider gilt: Die Quellen enthalten dazu keine Informationen.')).toBe(false);
    expect(beginsWithRefusal('Die Quellen enthalten dazu leider keine Informationen.')).toBe(false);
    expect(beginsWithRefusal('Sie gilt ab 2026. The sources do not cover this.')).toBe(false);
  });
});

describe('the mapping from document_index to a source', () => {
  it('follows the order the builder emitted, not the order of the map', () => {
    // `document_index` is zero-based over document blocks. Resolving it through
    // anything but the builder's own list points chips at the wrong source and
    // they still look valid.
    const second: CitableSource = { id: 'src-2', title: 'Notiz', text: 'Ganz anderer Text.' };
    const both = new Map([
      ['src-2', second],
      ['src-1', source],
    ]);

    const { kept } = resolveCitations([citation({ document_index: 0 })], {
      sourceIds: ['src-1', 'src-2'],
      sources: both,
    });

    expect(kept[0].sourceId).toBe('src-1');
  });

  it('drops a citation whose index belongs to a different source than its text', () => {
    const second: CitableSource = { id: 'src-2', title: 'Notiz', text: 'Ganz anderer Text.' };
    const both = new Map([
      ['src-1', source],
      ['src-2', second],
    ]);

    const { kept, dropped } = resolveCitations([citation({ document_index: 1 })], {
      sourceIds: ['src-1', 'src-2'],
      sources: both,
    });

    expect(kept).toEqual([]);
    expect(dropped[0].reason).toBe('out-of-range');
  });
});

describe('answerText', () => {
  it('joins the blocks of a cited sentence back into that sentence', () => {
    // What the API actually returns for one sentence with one citation in it:
    // the cited span is its own block, so the sentence arrives in three pieces.
    const segments = [
      { text: 'The rules apply from' },
      { text: ' 2 August 2027' },
      { text: ', according to Article 113.' },
    ];

    expect(answerText(segments)).toBe('The rules apply from 2 August 2027, according to Article 113.');
  });

  it('keeps the paragraph breaks the model itself wrote', () => {
    // The blank line belongs to the model's text, not to the block boundary.
    // Joining must not add one and must not swallow one.
    const segments = [{ text: 'First paragraph.\n\nSecond' }, { text: ' paragraph.' }];

    expect(answerText(segments)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('is empty for an answer without blocks', () => {
    expect(answerText([])).toBe('');
  });
});
