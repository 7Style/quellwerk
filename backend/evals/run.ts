/**
 * The eval runner.
 *
 *   pnpm eval --smoke        recorded fixtures, no API key, runs in CI
 *   pnpm eval --sanity       stub answerer over the whole dev split (M1-T4)
 *   pnpm eval --dev          the live route on the dev split (M3-T5)
 *   pnpm eval --full         dev and held-out, once, at the end (M3-T5)
 *   pnpm eval --record       records fixtures from the live route (M3-T5)
 *   pnpm eval --cache-check  asserts the cache is actually read (M6-T1)
 *   pnpm eval --batch        the same over the Batch API (M6)
 *
 * Two metrics are computed here and not by a model: whether a citation points
 * at the text it claims, and whether an unanswerable question was refused with
 * the exact sentence. Both are decidable, so deciding them with a judge would
 * be slower, dearer and less certain.
 *
 * Exit code: non-zero when an invariant broke, not when a quality number is
 * low. A citation that does not match its source is a defect; a correctness of
 * 0.82 is a number to compare against docs/SPEC.md. The thresholds live there
 * and are deliberately not repeated in this file.
 */
import { byFile, loadCorpus, type CorpusFile } from './corpus.js';
import { GOLDEN_FILE, loadGolden, type GoldenItem } from './golden.js';
import { createJudge, isJudgeable, meanOfScored, type JudgeScores } from './judges.js';
import {
  formatReport,
  writeResults,
  type InvalidCitation,
  type ItemOutcome,
  type RunMetrics,
  type RunReport,
} from './report.js';
import { FixtureAnswerer, recordedIds } from './answerers/fixture.answerer.js';
import type { Answerer, EvalCitation } from './answerers/types.js';
import path from 'node:path';
import { access } from 'node:fs/promises';

/**
 * The two refusal sentences, character for character, as the frozen system
 * prompt fixes them (docs/SPEC.md). The comparison is exact on purpose: a
 * refusal that a regular expression has to be lenient about is a refusal the
 * user cannot recognise either. Adding a language means adding its sentence
 * here, never loosening the comparison (prompts/README.md).
 */
const REFUSALS: Record<string, string> = {
  de: 'Die Quellen enthalten dazu keine Informationen.',
  en: 'The sources do not cover this.',
};

const MODES = [
  'smoke',
  'sanity',
  'dev',
  'full',
  'record',
  'cache-check',
  'batch',
] as const;
type Mode = (typeof MODES)[number];

/** Modes that need the chat route and the LLM adapter; they arrive with M3-T5. */
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

/**
 * The one check the whole product rests on, run exactly as the chat route will
 * run it: slice the stored text and compare (CLAUDE.md, ADR-0003).
 *
 * What is recorded about a failure is offsets and lengths, never the cited text
 * or the slice. That is the rule for the production log, and a harness that
 * held itself to a lower standard would be the place where the habit breaks.
 */
function checkCitation(citation: EvalCitation, corpus: Map<string, CorpusFile>): InvalidCitation | null {
  const file = corpus.get(citation.file);
  if (!file) {
    return {
      file: citation.file,
      start: citation.start,
      end: citation.end,
      citedLength: citation.citedText.length,
      sliceLength: 0,
      kind: 'unknown-file',
    };
  }

  const inRange =
    citation.start >= 0 && citation.end <= file.text.length && citation.start < citation.end;
  const slice = inRange ? file.text.slice(citation.start, citation.end) : '';

  if (slice === citation.citedText) return null;

  return {
    file: citation.file,
    start: citation.start,
    end: citation.end,
    citedLength: citation.citedText.length,
    sliceLength: slice.length,
    kind: inRange ? 'mismatch' : 'out-of-range',
  };
}

function isRefusal(text: string, lang: string): boolean {
  const sentence = REFUSALS[lang];
  if (!sentence) return false;
  return text.trimStart().startsWith(sentence);
}

function emptyScores(): JudgeScores {
  return { correctness: null, faithfulness: null };
}

function computeMetrics(items: ItemOutcome[]): RunMetrics {
  const citationsTotal = items.reduce((sum, item) => sum + item.citationsTotal, 0);
  const citationsValid = items.reduce((sum, item) => sum + item.citationsValid, 0);

  const unanswerable = items.filter((item) => item.type === 'unanswerable');
  const answerable = items.filter((item) => item.type !== 'unanswerable');
  const refusedCorrectly = unanswerable.filter((item) => item.refused).length;

  return {
    citationsTotal,
    citationsValid,
    // No citations means no measurement. Reporting 100 percent here would be
    // the harness congratulating itself for an empty run.
    citationValidity: citationsTotal === 0 ? null : citationsValid / citationsTotal,
    unanswerableTotal: unanswerable.length,
    unanswerableRefused: refusedCorrectly,
    abstentionAccuracy: unanswerable.length === 0 ? null : refusedCorrectly / unanswerable.length,
    answerableTotal: answerable.length,
    falseRefusals: answerable.filter((item) => item.refused).length,
    citedWhileRefusing: items.filter((item) => item.citedWhileRefusing).length,
    correctness: meanOfScored(items.map((item) => item.scores.correctness)),
    faithfulness: meanOfScored(items.map((item) => item.scores.faithfulness)),
  };
}

async function runItems(
  items: GoldenItem[],
  answerer: Answerer,
  corpus: Map<string, CorpusFile>
): Promise<ItemOutcome[]> {
  const judge = createJudge();
  const outcomes: ItemOutcome[] = [];

  for (const item of items) {
    const base = {
      id: item.id,
      type: item.type,
      split: item.split,
      lang: item.lang,
    };

    let answer;
    try {
      answer = await answerer.answer(item);
    } catch (error) {
      outcomes.push({
        ...base,
        citationsTotal: 0,
        citationsValid: 0,
        invalid: [],
        refused: false,
        abstention: null,
        citedWhileRefusing: false,
        scores: emptyScores(),
        latencyMs: 0,
        error: (error as Error).message,
      });
      continue;
    }

    const invalid = answer.citations
      .map((citation) => checkCitation(citation, corpus))
      .filter((result): result is InvalidCitation => result !== null);

    const refused = isRefusal(answer.text, item.lang);
    const scores =
      judge.available && isJudgeable(item) ? await judge.judge(item, answer) : emptyScores();

    outcomes.push({
      ...base,
      citationsTotal: answer.citations.length,
      citationsValid: answer.citations.length - invalid.length,
      invalid,
      refused,
      abstention: item.type === 'unanswerable' ? refused : null,
      // "Eine Ablehnung traegt keinen einzigen Chip" (docs/SPEC.md). A refusal
      // with a citation is a contradiction the UI would render as one.
      citedWhileRefusing: refused && answer.citations.length > 0,
      scores,
      latencyMs: answer.latencyMs ?? 0,
    });
  }

  return outcomes;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const notes: string[] = [];

  const blocked = NEEDS_LIVE_ROUTE[mode];
  if (blocked) {
    console.error(`--${mode} needs the live chat route and an API key. It arrives with ${blocked}.`);
    console.error('Available today: --smoke (recorded fixtures, no key).');
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
  const answerer: Answerer = new FixtureAnswerer();

  // --smoke is exactly the recorded subset: every item that has a fixture, and
  // no item that has not. A smoke run that failed on a missing fixture would
  // fail for the wrong reason and would train everyone to ignore it.
  const recorded = await recordedIds();
  const selected = items.filter((item) => recorded.has(item.id));

  if (selected.length === 0) {
    console.error('No fixtures under evals/fixtures/, so --smoke has nothing to run.');
    process.exit(2);
  }
  notes.push(`smoke subset: ${selected.length} of ${items.length} golden items have a fixture`);

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const outcomes = await runItems(selected, answerer, corpus);
  const metrics = computeMetrics(outcomes);

  const report: RunReport = {
    mode,
    answerer: answerer.name,
    callsModel: answerer.callsModel,
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

  // Invariants, not thresholds: a citation that does not match its source, a
  // refusal that still cites, or an item that produced nothing at all.
  const invalidCitations = metrics.citationsTotal - metrics.citationsValid;
  const errors = outcomes.filter((outcome) => outcome.error).length;
  const broken = invalidCitations + metrics.citedWhileRefusing + errors;

  if (broken > 0) {
    console.error(
      `FAIL: ${invalidCitations} invalid citation(s), ${metrics.citedWhileRefusing} refusal(s) with citations, ${errors} item(s) without an answer.`
    );
    process.exit(1);
  }
}

await main();
