import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { ExtractionError, extract } from '../extract.js';
import { isNormalized } from '../normalize.js';
import { pageAt } from '../pages.js';

const CORPUS = join(import.meta.dirname, '../../../../../evals/corpus');
const read = (file: string): Buffer => readFileSync(join(CORPUS, file));

/**
 * The PDF uses subset fonts with their own encoding. Reading the content
 * streams directly returns a uniform character shift, so "Union" arrives as
 * "8QLRQ" and every citation offset would point into that. These three
 * sentences stand verbatim in the document; they are the assertion, not
 * "some text came out".
 */
const VERBATIM = [
  'Sie gilt ab dem 2. August 2026',
  'Die Kapitel I und II gelten ab dem 2. Februar 2025',
  'Verbotene Praktiken im KI-Bereich',
];

describe('extract, plain formats', () => {
  it('reads markdown and keeps it normalised, without inventing pages', async () => {
    const result = await extract('md', read('03-glossar.md'));
    expect(result.text).toContain('Anbieter');
    expect(isNormalized(result.text)).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it('reads pasted text', async () => {
    const result = await extract('paste', 'Ein eingefügter Absatz.\r\n\r\n\r\nMit Abstand.');
    expect(result.text).toBe('Ein eingefügter Absatz.\n\nMit Abstand.');
  });

  it('refuses an empty source instead of storing nothing', async () => {
    await expect(extract('txt', '   \n\n  ')).rejects.toThrow(ExtractionError);
    await expect(extract('txt', '')).rejects.toMatchObject({ reason: 'empty' });
  });
});

describe('extract, PDF', () => {
  it('decodes the subset fonts: the three sentences stand verbatim in the text', async () => {
    const { text } = await extract('pdf', read('01-ki-vo-auszug.pdf'));
    for (const sentence of VERBATIM) {
      expect(text).toContain(sentence);
    }
  }, 60_000);

  it('returns normalised text with a page map that maps back', async () => {
    const { text, pages } = await extract('pdf', read('01-ki-vo-auszug.pdf'));

    expect(isNormalized(text)).toBe(true);
    expect(pages.length).toBeGreaterThan(1);

    // Every span slices out of the same string the offsets belong to.
    for (const span of pages) {
      expect(span.end).toBeGreaterThanOrEqual(span.start);
      expect(span.end).toBeLessThanOrEqual(text.length);
    }

    // A known sentence resolves to a real page, which is what a hover shows.
    const offset = text.indexOf(VERBATIM[0] ?? '');
    expect(offset).toBeGreaterThan(-1);
    expect(pageAt(pages, offset)).not.toBeNull();
  }, 60_000);

  it('rejects a PDF without a text layer rather than storing an empty source', async () => {
    // A valid but text-free PDF: one empty page.
    const blank = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
        'trailer<</Root 1 0 R>>\n%%EOF\n',
      'latin1'
    );
    await expect(extract('pdf', blank)).rejects.toMatchObject({ reason: 'no-text-layer' });
  }, 30_000);
});
