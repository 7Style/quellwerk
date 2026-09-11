/**
 * The eval runner.
 *
 *   pnpm eval --smoke        recorded fixtures, no API key, runs in CI
 *   pnpm eval --sanity       stub answerer over the whole golden set, no key
 *   pnpm eval --dev          the live route on the dev split (M3-T5)
 *   pnpm eval --full         dev and held-out, once, at the end (M3-T5)
 *   pnpm eval --record       records fixtures from the live route (M3-T5)
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
import { GOLDEN_FILE, loadGolden, type GoldenItem } from './golden.js';
import { formatReport, writeResults, type RunReport } from './report.js';
import { computeMetrics, countBroken, runItems } from './score.js';
import { FixtureAnswerer, recordedIds } from './answerers/fixture.answerer.js';
import { StubAnswerer } from './answerers/stub.answerer.js';
import type { Answerer } from './answerers/types.js';

const MODES = ['smoke', 'sanity', 'dev', 'full', 'record', 'cache-check', 'batch'] as const;
type Mode = (typeof MODES)[number];

/** Modes that need the chat route and the LLM adapter. */
const NEEDS_LIVE_ROUTE: Record<string, string> = {
  dev: 'M3-T5, once the chat route exists',
  full: 'M3-T5',
  record: 'M3-T5, it records what the live route answers',
  'cache-check': 'M6-T1, it asserts cache_read_input_tokens on a second turn',
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
}

async function select(mode: Mode, items: GoldenItem[]): Promise<Selection> {
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

  const blocked = NEEDS_LIVE_ROUTE[mode];
  if (blocked) {
    console.error(`--${mode} needs the live chat route and an API key. It arrives with ${blocked}.`);
    console.error('Available today: --smoke (recorded fixtures) and --sanity (stub). Neither needs a key.');
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
    notes.push('golden.jsonl does not exist yet; this run used golden.draft.jsonl. Numbers from a draft do not belong in RESULTS.md.');
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

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const outcomes = await runItems(selection.items, selection.answerer, corpus);
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
