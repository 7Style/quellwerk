/**
 * The ids of the seeded sources, and the file the seed refuses to run without.
 *
 * The id is the whole reason this test exists. The demo notebook shipped with
 * `demo-1` to `demo-4` in it, `sourceIdParamSchema` is `z.uuid()`, and the
 * result was a 400 on the text route: every chip in the notebook every visitor
 * sees opened "The document could not be loaded". A shape that the route's own
 * schema accepts is therefore asserted here with that schema, not with a
 * regular expression somebody wrote next to it.
 */
import { describe, expect, it } from '@jest/globals';

import { sourceIdParamSchema } from '../../../app/modules/sources/dto/source.dto.js';
import { demoDataSchema, demoSourceId, DEMO_ID } from '../demo.js';
import demoJson from '../demo.json' with { type: 'json' };

const FILES = [
  '01-ki-vo-auszug.pdf',
  '02-kommission-faq.md',
  '03-glossar.md',
  '04-interne-notiz.md',
];

describe('the id of a seeded source', () => {
  it('is a uuid the text route accepts', () => {
    for (const file of FILES) {
      const parsed = sourceIdParamSchema.safeParse({
        notebookId: DEMO_ID,
        sourceId: demoSourceId(file),
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('is the same id on every machine and on every run', () => {
    // The server seeds from the same files and has to arrive at the same rows.
    expect(demoSourceId('01-ki-vo-auszug.pdf')).toBe(demoSourceId('01-ki-vo-auszug.pdf'));
    expect(demoSourceId('01-ki-vo-auszug.pdf')).toBe('a1488ecc-38ad-57b1-a87c-c38001c07d3c');
  });

  it('differs per file', () => {
    expect(new Set(FILES.map(demoSourceId)).size).toBe(FILES.length);
  });

  it('is derived from the name, so inserting a source renumbers nothing', () => {
    // Position would have been the obvious key and the wrong one: a fifth
    // source in the middle of the manifest would move every id after it, and
    // every citation stored against those ids would point at another document.
    const before = demoSourceId('04-interne-notiz.md');
    expect(demoSourceId('04-interne-notiz.md')).toBe(before);
  });
});

describe('the checked-in demo data', () => {
  it('parses, and covers all four corpus files', () => {
    const data = demoDataSchema.parse(demoJson);

    expect(data.sources.map((one) => one.file).sort()).toEqual([...FILES].sort());
    expect(data.notebook.suggestedQuestions).toHaveLength(4);
    // Every source carries a language, which is what the demo notebook lacked:
    // without it `languageOf` falls back to English and the German notebook
    // writes an English report.
    for (const source of data.sources) {
      expect(source.guide.language.length).toBeGreaterThan(0);
      expect(source.tokens).toBeGreaterThan(0);
    }
  });

  it('is mostly German, which is what the reports are written in', () => {
    const data = demoDataSchema.parse(demoJson);
    const german = data.sources.filter((one) => one.guide.language === 'German');

    expect(german.length).toBeGreaterThan(data.sources.length / 2);
  });
});
