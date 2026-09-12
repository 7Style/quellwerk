/**
 * The eval runner.
 *
 *   pnpm eval --smoke        recorded fixtures, no API key, runs in CI
 *   pnpm eval --sanity       stub answerer over the whole golden set, no key
 *   pnpm eval --dev          the real model on the dev split, judges on
 *   pnpm eval --full         dev and held-out, once, at the end
 *   pnpm eval --record       records fixtures from the live answerer (open)
 *   pnpm eval --cache-check  asserts the cache is actually read (M6-T1)
 *   pnpm eval --batch        the same over the Batch API (M6)
 *
 * Two metrics are computed without a model, because both are decidable: whether
 * a citation points at the text it claims, and whether an unanswerable question
 * was refused with the exact sentence. Deciding either with a judge would be
 * slower, dearer and less certain. The deciding lives in score.ts.
 *
 * Exit code: non-zero when an invariant broke, not when a quality number is
 * low. A citation that does not match its source is a defect; a correctness of
 * 0.82 is a number to compare against docs/SPEC.md. The thresholds live there
 * and are deliberately not repeated in this file.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';

import { byFile, loadCorpus } from './corpus.js';
import { formatCacheCheck, runCacheCheck } from './cache-check.js';
import { devSplit, GOLDEN_FILE, loadGolden, type GoldenItem } from './golden.js';
import { createJudge, isSelfJudged, type Judge } from './judges.js';
import { LiveAnswerer } from './answerers/live.answerer.js';
import { env } from '../app/config/env.config.js';
import { formatReport, writeResults, type RunReport } from './report.js';
import { computeMetrics, countBroken, runItems } from './score.js';
import { FixtureAnswerer, recordedIds } from './answerers/fixture.answerer.js';
import { StubAnswerer } from './answerers/stub.answerer.js';
import type { Answerer } from './answerers/types.js';

const MODES = ['smoke', 'sanity', 'dev', 'full', 'record', 'cache-check', 'batch'] as const;
type Mode = (typeof MODES)[number];

/** Modes that still need something that does not exist yet. */
const NOT_YET: Record<string, string> = {
  // The ten fixtures under evals/fixtures/ are handwritten and say so in their
  // own `recordedBy` field. That is deliberate for --smoke, which exists to run
  // the harness in CI without a key: a fixture written by hand from the corpus
  // is a fixture whose expected offsets nobody generated with the code under
  // test. Recording from the live answerer would make --smoke a replay of one
  // past run instead, which is a different and weaker thing.
  record: 'not written. The shipped fixtures are handwritten; see evals/fixtures/*.json',
  batch: 'M6',
};

function parseMode(argv: string[]): Mode {
  const flags = argv.filter((arg) => arg.startsWith('--')).map((arg) => arg.slice(2));
  if (flags.length === 0) {
    console.error(`Pick a mode: ${MODES.map((mode) => `--${mode}`).join(' ')}`);
    process.exit(2);
  }
  if (flags.length > 1) {
    console.error(`One mode at a time, got: ${flags.join(', ')}`);
    process.exit(2);
  }
  const mode = flags[0];
  if (!MODES.includes(mode as Mode)) {
    console.error(`Unknown mode --${mode}. Known: ${MODES.map((m) => `--${m}`).join(' ')}`);
    process.exit(2);
  }
  return mode as Mode;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

interface Selection {
  answerer: Answerer;
  items: GoldenItem[];
  notes: string[];
  /** Absent for the offline modes: the graded metrics stay null there. */
  judge?: Judge;
}

async function select(mode: Mode, items: GoldenItem[]): Promise<Selection> {
  if (mode === 'dev' || mode === 'full') {
    if (!env.ANTHROPIC_API_KEY) {
      console.error(`--${mode} calls the real model and needs ANTHROPIC_API_KEY.`);
      process.exit(2);
    }

    const corpus = await loadCorpus();
    // dev is the twenty items that may be looked at; full adds the ten that may
    // not, and is run once at the end. A held-out split that is measured every
    // day is a dev split with extra steps (docs/SPEC.md).
    const selected = mode === 'dev' ? devSplit(items) : items;

    return {
      answerer: new LiveAnswerer(corpus),
      items: selected,
      judge: createJudge(corpus, env.ANTHROPIC_API_KEY),
      notes:
        mode === 'full'
          ? ['full: the held-out split was measured. Do not tune against these numbers.']
          : ['dev: the held-out split was not touched.'],
    };
  }

  if (mode === 'sanity') {
    // The stub answers every item, so this mode says whether the harness itself
    // is sound: does every golden item have findable evidence, does every
    // refusal come out as a refusal. It grades the set, not the product.
    return {
      answerer: new StubAnswerer(byFile(await loadCorpus())),
      items,
      notes: ['sanity: the stub derives its answers from the golden set, so it measures the set and the harness, never answer quality'],
    };
  }

  // --smoke is exactly the recorded subset: every item that has a fixture, and
  // no item that has not. A smoke run that failed on a missing fixture would
  // fail for the wrong reason and would train everyone to ignore it.
  const recorded = await recordedIds();
  const selected = items.filter((item) => recorded.has(item.id));
  if (selected.length === 0) {
    console.error('No fixtures under evals/fixtures/, so --smoke has nothing to run.');
    process.exit(2);
  }
  return {
    answerer: new FixtureAnswerer(),
    items: selected,
    notes: [`smoke subset: ${selected.length} of ${items.length} golden items have a fixture`],
  };
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const notes: string[] = [];

  // Its own shape: four calls, one number each, no golden set and no judge.
  // Forcing it through the item runner would mean inventing items whose only
  // purpose is to be sent twice.
  if (mode === 'cache-check') {
    if (!env.ANTHROPIC_API_KEY) {
      console.error('--cache-check calls the real model and needs ANTHROPIC_API_KEY.');
      process.exit(2);
    }

    const report = await runCacheCheck(await loadCorpus());
    console.log(formatCacheCheck(report));
    console.log('');

    if (report.failures.length > 0) process.exit(1);
    return;
  }

  const blocked = NOT_YET[mode];
  if (blocked) {
    console.error(`--${mode} is not available: ${blocked}.`);
    console.error('Available today: --smoke, --sanity, --dev, --full.');
    process.exit(2);
  }

  // The golden set is written by hand and may not exist yet. Falling back to the
  // draft is fine as long as nobody can miss that it happened: the fallback is
  // printed, carried in the report and written into the results file.
  let goldenFile = GOLDEN_FILE;
  if (!(await exists(goldenFile))) {
    const draft = goldenFile.replace(/golden\.jsonl$/, 'golden.draft.jsonl');
    if (!(await exists(draft))) {
      console.error('Neither evals/golden.jsonl nor evals/golden.draft.jsonl exists.');
      process.exit(2);
    }
    goldenFile = draft;
    notes.push('golden.jsonl does not exist yet; this run used golden.draft.jsonl. A RESULTS.md block built from these numbers has to say so in its first line.');
  }

  const { items, problems } = await loadGolden(goldenFile);
  if (problems.length > 0) {
    console.error(`The golden set has ${problems.length} unreadable line(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(2);
  }

  const corpus = byFile(await loadCorpus());
  const selection = await select(mode, items);
  notes.push(...selection.notes);

  if (selection.judge?.available && isSelfJudged()) {
    // docs/SPEC.md: a row graded by the model under test is marked as such.
    notes.push('self-judged: MODEL_JUDGE is the same model as MODEL_CHAT.');
  }
  if (selection.judge && !selection.judge.available) {
    notes.push(`judge unavailable: ${selection.judge.unavailableBecause ?? 'unknown reason'}`);
  }

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const outcomes = await runItems(selection.items, selection.answerer, corpus, selection.judge);
  const metrics = computeMetrics(outcomes);

  const report: RunReport = {
    mode,
    answerer: selection.answerer.name,
    callsModel: selection.answerer.callsModel,
    goldenFile: path.basename(goldenFile),
    startedAt,
    durationMs: Date.now() - started,
    items: outcomes,
    metrics,
    notes,
  };

  const file = await writeResults(report);
  console.log(formatReport(report));
  console.log(`  written: ${path.relative(process.cwd(), file)}`);
  console.log('');

  const broken = countBroken(outcomes, metrics);
  if (broken > 0) {
    const invalidCitations = metrics.citationsTotal - metrics.citationsValid;
    const errors = outcomes.filter((outcome) => outcome.error).length;
    console.error(
      `FAIL: ${invalidCitations} invalid citation(s), ${metrics.citedWhileRefusing} refusal(s) with citations, ${errors} item(s) without an answer.`
    );
    process.exit(1);
  }
}

await main();
