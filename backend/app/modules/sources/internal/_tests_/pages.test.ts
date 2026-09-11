import { describe, expect, it } from '@jest/globals';
import { normalize } from '../normalize.js';
import { assertNormalized, buildPagedText, pageAt } from '../pages.js';

describe('buildPagedText', () => {
  const raw = [
    'Seite eins.\r\nMit zwei Zeilen.   ',
    'Seite zwei spricht von Union und Einklang.',
    '',
    'Seite vier nach einer leeren Seite.',
  ];

  it('round trip: every span slices back to its own normalised page', () => {
    const { text, pages } = buildPagedText(raw);
    expect(pages).toHaveLength(raw.length);
    for (const span of pages) {
      expect(text.slice(span.start, span.end)).toBe(normalize(raw[span.page - 1] ?? ''));
    }
  });

  it('keeps the number of an empty page and gives it a zero-length span', () => {
    const { pages } = buildPagedText(raw);
    const empty = pages[2];
    expect(empty?.page).toBe(3);
    expect(empty?.start).toBe(empty?.end);
  });

  it('produces text that is itself in normal form', () => {
    const { text } = buildPagedText(raw);
    expect(() => {
      assertNormalized(text);
    }).not.toThrow();
    // The empty page must not have left three newlines behind.
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('maps an offset back to the page a reader would name', () => {
    const { text, pages } = buildPagedText(raw);
    const needle = 'Union';
    const offset = text.indexOf(needle);
    expect(offset).toBeGreaterThan(-1);
    expect(pageAt(pages, offset)).toBe(2);

    expect(pageAt(pages, 0)).toBe(1);
    expect(pageAt(pages, text.length)).toBe(4);
    expect(pageAt(pages, -1)).toBeNull();
    expect(pageAt(pages, text.length + 1)).toBeNull();
  });

  it('handles a single page and no page at all', () => {
    const one = buildPagedText(['nur eine Seite']);
    expect(one.text).toBe('nur eine Seite');
    expect(one.pages).toEqual([{ page: 1, start: 0, end: 14 }]);

    const none = buildPagedText([]);
    expect(none.text).toBe('');
    expect(none.pages).toEqual([]);
  });
});
