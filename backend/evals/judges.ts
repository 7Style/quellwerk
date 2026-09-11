/**
 * The two graded metrics: correctness against the reference facts of a golden
 * item, and faithfulness as the share of claims that a citation supports.
 *
 * Both need a model (`MODEL_JUDGE`, a different one from the route under test,
 * ADR-0011) and both need their prompts in `prompts/`. Neither exists before
 * M3-T5, and neither can run in `--smoke`: a judge that calls an API is not a
 * check that runs in CI without a key.
 *
 * So this file is the seam and, for now, an honest refusal. It returns `null`
 * scores with a reason instead of a number, and the report prints the reason.
 * A judge that quietly returned 1.0 when it could not run would put a perfect
 * score into RESULTS.md that nobody measured, and that is the one failure mode
 * an eval harness must not have.
 */
import type { GoldenItem } from './golden.js';
import type { EvalAnswer } from './answerers/types.js';

export interface JudgeScores {
  /** 0 or 1 per item: does the answer carry the reference facts. Null when not judged. */
  correctness: number | null;
  /** 0 to 1: share of claims backed by a citation. Null for refusals and when not judged. */
  faithfulness: number | null;
  /** Why a score is null. Empty when it is a number. */
  reason?: string;
}

export interface Judge {
  readonly name: string;
  readonly available: boolean;
  /** Set when `available` is false: one sentence, printed on the report. */
  readonly unavailableBecause?: string;
  judge(item: GoldenItem, answer: EvalAnswer): Promise<JudgeScores>;
}

/**
 * Judges refusals out of the faithfulness mean rather than scoring them zero.
 * A refusal makes no claims, so there is nothing to be unfaithful about; a zero
 * would drag the mean down for doing exactly the right thing (docs/SPEC.md).
 */
export function isJudgeable(item: GoldenItem): boolean {
  return item.type !== 'unanswerable';
}

class UnavailableJudge implements Judge {
  readonly name = 'none';
  readonly available = false;
  readonly unavailableBecause =
    'the judge prompts and the LLM adapter arrive with the chat route (M3-T5); until then correctness and faithfulness are not measured';

  async judge(): Promise<JudgeScores> {
    return { correctness: null, faithfulness: null, reason: this.unavailableBecause };
  }
}

/**
 * Returns the judge for this run. Today there is exactly one and it declines;
 * M3-T5 replaces the body, not the call sites.
 */
export function createJudge(): Judge {
  return new UnavailableJudge();
}

/** Mean over the scores that are numbers, or null when none is. */
export function meanOfScored(scores: (number | null)[]): number | null {
  const numbers = scores.filter((score): score is number => score !== null);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, score) => sum + score, 0) / numbers.length;
}
