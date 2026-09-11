/**
 * The check that makes the rest of the harness worth running.
 *
 * Two halves, and both are necessary. The first asserts that the recorded
 * fixtures are valid: that is the regression guard, and it fires the day
 * `normalize` or the corpus changes under them. The second asserts that the
 * check can fail: it corrupts a citation in each of the ways a citation goes
 * wrong in practice and requires the run to be reported as broken.
 *
 * A suite that only ever feeds a checker correct input proves that correct
 * input passes, which is not what anyone needs to know (ADR-0008).
 */
import { describe, expect, it, beforeAll } from '@jest/globals';

import path from 'node:path';

import { byFile, loadCorpus, type CorpusFile } from '../corpus.js';
import { EVALS_DIR, loadGolden, type GoldenItem } from '../golden.js';
import { checkCitation, computeMetrics, countBroken, isRefusal, runItems } from '../score.js';
import { FixtureAnswerer, recordedIds } from '../answerers/fixture.answerer.js';
import { StubAnswerer, type Corruption } from '../answerers/stub.answerer.js';

/** Reading and extracting a 25 page PDF is the slow part; it happens once. */
const SETUP_TIMEOUT = 60_000;

const DRAFT = path.join(EVALS_DIR, 'golden.draft.jsonl');

let corpus: Map<string, CorpusFile>;
let items: GoldenItem[];

beforeAll(async () => {
  corpus = byFile(await loadCorpus());
  const parsed = await loadGolden(DRAFT);
  expect(parsed.problems).toEqual([]);
  items = parsed.items;
}, SETUP_TIMEOUT);

describe('the recorded fixtures', () => {
  it(
    'cite text that really stands at those offsets',
    async () => {
      const recorded = await recordedIds();
      const selected = items.filter((item) => recorded.has(item.id));
      expect(selected.length).toBeGreaterThan(0);

      const outcomes = await runItems(selected, new FixtureAnswerer(), corpus);
      const metrics = computeMetrics(outcomes);

      expect(metrics.citationsTotal).toBeGreaterThan(0);
      expect(metrics.citationValidity).toBe(1);
      expect(countBroken(outcomes, metrics)).toBe(0);
    },
    SETUP_TIMEOUT
  );

  it('leave every refusal without a single citation', async () => {
    const recorded = await recordedIds();
    const selected = items.filter((item) => recorded.has(item.id));
    const outcomes = await runItems(selected, new FixtureAnswerer(), corpus);

    const refusals = outcomes.filter((outcome) => outcome.refused);
    expect(refusals.length).toBeGreaterThan(0);
    for (const refusal of refusals) expect(refusal.citationsTotal).toBe(0);
  });
});

describe('a broken citation', () => {
  const cases: Array<[Corruption, string]> = [
    ['shift-offset', 'mismatch'],
    ['out-of-range', 'out-of-range'],
    ['edit-cited-text', 'mismatch'],
  ];

  it.each(cases)('is caught when the citation is %s', async (corruption, expectedKind) => {
    // g01 is the simplest grounded item: one source, one quote, one sentence.
    const answerer = new StubAnswerer(corpus, { corrupt: corruption, corruptItem: 'g01' });
    const outcomes = await runItems(items, answerer, corpus);
    const metrics = computeMetrics(outcomes);

    const broken = outcomes.find((outcome) => outcome.id === 'g01');
    expect(broken?.invalid).toHaveLength(1);
    expect(broken?.invalid[0]?.kind).toBe(expectedKind);

    // And it has to reach the run, not just the item: this is what turns into
    // a non-zero exit code in run.ts and a red build in CI.
    expect(metrics.citationValidity).toBeLessThan(1);
    expect(countBroken(outcomes, metrics)).toBeGreaterThan(0);
  });

  it('is reported with offsets and lengths, never with the text', async () => {
    const answerer = new StubAnswerer(corpus, { corrupt: 'shift-offset', corruptItem: 'g01' });
    const outcomes = await runItems(items, answerer, corpus);
    const invalid = outcomes.find((outcome) => outcome.id === 'g01')?.invalid[0];

    expect(invalid).toBeDefined();
    expect(Object.keys(invalid ?? {}).sort()).toEqual([
      'citedLength',
      'end',
      'file',
      'kind',
      'sliceLength',
      'start',
    ]);
  });

  it('is caught by checkCitation on its own, without a run', () => {
    const file = corpus.get('03-glossar.md');
    expect(file).toBeDefined();
    const text = file?.text ?? '';
    const quote = text.slice(100, 140);

    expect(checkCitation({ file: '03-glossar.md', start: 100, end: 140, citedText: quote }, corpus)).toBeNull();
    expect(
      checkCitation({ file: '03-glossar.md', start: 101, end: 141, citedText: quote }, corpus)?.kind
    ).toBe('mismatch');
    expect(
      checkCitation({ file: 'does-not-exist.md', start: 0, end: 10, citedText: 'x' }, corpus)?.kind
    ).toBe('unknown-file');
  });
});

describe('a refusal', () => {
  it('is recognised only from the exact sentence at the start', () => {
    expect(isRefusal('Die Quellen enthalten dazu keine Informationen.', 'de')).toBe(true);
    expect(isRefusal('Die Quellen enthalten dazu keine Informationen. Dazu steht nichts im Auszug.', 'de')).toBe(true);
    expect(isRefusal('  The sources do not cover this.', 'en')).toBe(true);

    // A paraphrase is not a refusal. The UI recognises the sentence too, and a
    // fuzzy match here would hide a prompt that stopped producing it.
    expect(isRefusal('Die Quellen enthalten dazu leider keine Informationen.', 'de')).toBe(false);
    expect(isRefusal('Dazu enthalten die Quellen keine Informationen.', 'de')).toBe(false);
    expect(isRefusal('I could not find anything about this.', 'en')).toBe(false);
    // The full stop belongs to the sentence, so a continuation is not a
    // refusal either: "The sources do not cover this topic." is a paraphrase
    // that happens to start with the same words. It counts as a missed
    // abstention, which is what the metric is supposed to catch.
    expect(isRefusal('The sources do not cover this topic.', 'en')).toBe(false);
    // A language without a recorded sentence is never scored as a refusal.
    expect(isRefusal('Les sources ne couvrent pas ce sujet.', 'fr')).toBe(false);
  });

  it('that carries a citation fails the run', async () => {
    const answerer = new StubAnswerer(corpus, { corrupt: 'cite-while-refusing' });
    const outcomes = await runItems(items, answerer, corpus);
    const metrics = computeMetrics(outcomes);

    expect(metrics.citedWhileRefusing).toBeGreaterThan(0);
    expect(countBroken(outcomes, metrics)).toBeGreaterThan(0);
  });
});

describe('the golden set itself', () => {
  it('answers every item through the stub without a single broken citation', async () => {
    const outcomes = await runItems(items, new StubAnswerer(corpus), corpus);
    const metrics = computeMetrics(outcomes);

    expect(outcomes.filter((outcome) => outcome.error)).toEqual([]);
    expect(metrics.citationValidity).toBe(1);
    expect(metrics.abstentionAccuracy).toBe(1);
    expect(metrics.falseRefusals).toBe(0);
    expect(countBroken(outcomes, metrics)).toBe(0);
  });
});
