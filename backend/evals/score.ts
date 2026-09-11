/**
 * The part of the runner that decides, separated from the part that prints.
 *
 * It lives in its own file so a test can import it. `run.ts` is a command: it
 * ends in `await main()` and in `process.exit`, and importing a command to test
 * it would run it. Everything below is pure apart from the answerer call, which
 * is injected.
 */
import type { CorpusFile } from './corpus.js';
import type { GoldenItem } from './golden.js';
import { createJudge, isJudgeable, meanOfScored, type JudgeScores } from './judges.js';
import type { InvalidCitation, ItemOutcome, RunMetrics } from './report.js';
import type { Answerer, EvalCitation } from './answerers/types.js';

/**
 * The two refusal sentences, character for character, as the frozen system
 * prompt fixes them (docs/SPEC.md). The comparison is exact on purpose: a
 * refusal that a regular expression has to be lenient about is a refusal the
 * user cannot recognise either. Adding a language means adding its sentence
 * here, never loosening the comparison (prompts/README.md).
 */
export const REFUSALS: Record<string, string> = {
  de: 'Die Quellen enthalten dazu keine Informationen.',
  en: 'The sources do not cover this.',
};

/**
 * The one check the whole product rests on, run exactly as the chat route will
 * run it: slice the stored text and compare (CLAUDE.md, ADR-0003).
 *
 * What is recorded about a failure is offsets and lengths, never the cited text
 * or the slice. That is the rule for the production log, and a harness that
 * held itself to a lower standard would be the place where the habit breaks.
 */
export function checkCitation(
  citation: EvalCitation,
  corpus: Map<string, CorpusFile>
): InvalidCitation | null {
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

export function isRefusal(text: string, lang: string): boolean {
  const sentence = REFUSALS[lang];
  if (!sentence) return false;
  return text.trimStart().startsWith(sentence);
}

export function emptyScores(): JudgeScores {
  return { correctness: null, faithfulness: null };
}

export function computeMetrics(items: ItemOutcome[]): RunMetrics {
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

/** Counts the failures that make a run fail. Thresholds are not among them. */
export function countBroken(items: ItemOutcome[], metrics: RunMetrics): number {
  const invalidCitations = metrics.citationsTotal - metrics.citationsValid;
  const errors = items.filter((item) => item.error).length;
  return invalidCitations + metrics.citedWhileRefusing + errors;
}

export async function runItems(
  items: GoldenItem[],
  answerer: Answerer,
  corpus: Map<string, CorpusFile>
): Promise<ItemOutcome[]> {
  const judge = createJudge();
  const outcomes: ItemOutcome[] = [];

  for (const item of items) {
    const base = { id: item.id, type: item.type, split: item.split, lang: item.lang };

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
