/**
 * The two graded metrics: correctness against the reference facts of a golden
 * item, and faithfulness as the share of claims the sources support.
 *
 * Both run on `MODEL_JUDGE`, which is a different model from the one under test
 * (ADR-0011). A model grading its own answers agrees with itself, and the number
 * that comes out measures that agreement rather than the answer.
 *
 * Neither runs in `--smoke`: they call an API, and the smoke run exists to work
 * in CI without a key. `createJudge()` returns a judge that declines when there
 * is no key, and the report prints the reason rather than a number.
 */
import { z } from 'zod';

import { buildArtifactRequest } from '../app/adapters/llm/artifact-request.js';
import { AnthropicLlmAdapter } from '../app/adapters/llm/anthropic.adapter.js';
import { models } from '../app/config/models.js';
import { renderPrompt } from '../app/services/prompt-loader/index.js';
import type { CorpusFile } from './corpus.js';
import type { GoldenItem } from './golden.js';
import type { EvalAnswer } from './answerers/types.js';

export interface JudgeScores {
  /** 0 or 1 per item: does the answer carry the reference facts. Null when not judged. */
  correctness: number | null;
  /** 0 to 1: share of claims backed by the sources. Null for refusals and when not judged. */
  faithfulness: number | null;
  /** Why a score is null. Empty when it is a number. */
  reason?: string;
  /** What the judge said was missing or unsupported, for RESULTS.md. */
  missing?: string[];
  unsupported?: string[];
}

export interface Judge {
  readonly name: string;
  readonly available: boolean;
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

/** No length or count constraints: the API demotes them to prose (prompts/README.md). */
const correctnessSchema = z.object({
  correct: z.boolean(),
  missing: z.array(z.string()),
  wrong: z.array(z.string()),
  note: z.string(),
});

/**
 * One entry per claim, and no total.
 *
 * The first revision asked the judge for `claims` and `supported` as numbers.
 * It miscounted in three of twenty items, and its own `unsupported` entries said
 * so: each ended in "treated as supported overall" and was counted against the
 * answer anyway. A number a model writes is a number a model can get wrong, and
 * CLAUDE.md already says counts belong in code. So the judge decides one claim
 * at a time and the share is arithmetic here.
 */
const faithfulnessSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      supported: z.boolean(),
      note: z.string(),
    })
  ),
});

/**
 * Room for a claim list. A faithfulness verdict is now one entry per claim with
 * a note, so a fifteen claim answer needs several times what a bare count did,
 * and a verdict cut off at the cap is not a low score, it is a parse error.
 */
const JUDGE_MAX_TOKENS = 4_000;

class UnavailableJudge implements Judge {
  readonly name = 'none';
  readonly available = false;

  constructor(readonly unavailableBecause: string) {}

  async judge(): Promise<JudgeScores> {
    return { correctness: null, faithfulness: null, reason: this.unavailableBecause };
  }
}

class ModelJudge implements Judge {
  readonly name = models.judge;
  readonly available = true;

  constructor(
    private readonly llm: AnthropicLlmAdapter,
    private readonly corpus: CorpusFile[]
  ) {}

  async judge(item: GoldenItem, answer: EvalAnswer): Promise<JudgeScores> {
    // A refusal is graded on correctness only. Faithfulness over zero claims is
    // a division by zero dressed up as a metric.
    const [correctness, faithfulness] = await Promise.all([
      this.correctness(item, answer),
      isJudgeable(item) ? this.faithfulness(item, answer) : null,
    ]);

    return {
      correctness: correctness.correct ? 1 : 0,
      faithfulness: faithfulness ? faithfulness.score : null,
      missing: correctness.missing,
      unsupported: faithfulness?.unsupported ?? [],
    };
  }

  private async correctness(
    item: GoldenItem,
    answer: EvalAnswer
  ): Promise<{ correct: boolean; missing: string[] }> {
    const instructions = await renderPrompt('eval-judge-correctness');

    // The material goes in as text, not as document blocks: it is a question, an
    // answer and a list of facts, none of which is a source. Document blocks
    // would put the answer on the same footing as the corpus.
    const material =
      `Question:\n${item.question}\n\n` +
      `Answer:\n${answer.text}\n\n` +
      `Reference facts:\n${item.facts.map((fact) => `- ${fact}`).join('\n')}`;

    const { parsed } = await this.llm.parseArtifact<z.infer<typeof correctnessSchema>>(
      buildArtifactRequest({
        model: models.judge,
        instructions: `${material}\n\n---\n\n${instructions}`,
        sources: [],
        schema: correctnessSchema,
        maxTokens: JUDGE_MAX_TOKENS,
        effort: 'low',
      })
    );

    return { correct: parsed.correct, missing: parsed.missing };
  }

  private async faithfulness(
    item: GoldenItem,
    answer: EvalAnswer
  ): Promise<{ score: number | null; unsupported: string[] }> {
    const instructions = await renderPrompt('eval-judge-faithfulness');

    // Here the corpus IS the material, so it goes in as document blocks. The
    // judge has to be able to look things up in it.
    const { parsed } = await this.llm.parseArtifact<z.infer<typeof faithfulnessSchema>>(
      buildArtifactRequest({
        model: models.judge,
        instructions:
          `Question:\n${item.question}\n\nAnswer:\n${answer.text}\n\n---\n\n${instructions}`,
        sources: this.corpus.map((file, index) => ({
          id: file.file,
          position: index + 1,
          title: file.title,
          kind: file.kind,
          text: file.text,
        })),
        schema: faithfulnessSchema,
        maxTokens: JUDGE_MAX_TOKENS,
        effort: 'low',
        // Twenty items in a row over the same corpus, so the cache pays here.
        cache5m: true,
      })
    );

    if (parsed.claims.length === 0) return { score: null, unsupported: [] };

    const unsupported = parsed.claims.filter((claim) => !claim.supported);
    return {
      score: (parsed.claims.length - unsupported.length) / parsed.claims.length,
      // The claim, not the reasoning. The note is the judge's own place to think
      // and is not what a reader of RESULTS.md needs to see.
      unsupported: unsupported.map((claim) => claim.claim),
    };
  }
}

export function createJudge(corpus: CorpusFile[], apiKey?: string): Judge {
  if (!apiKey) {
    return new UnavailableJudge('no API key, so the graded metrics were not measured');
  }

  // A judge on the same model as the route is not refused, it is declared:
  // docs/SPEC.md requires RESULTS.md to mark such a row as self-judged, and
  // `isSelfJudged()` is what the report asks.
  return new ModelJudge(new AnthropicLlmAdapter(apiKey), corpus);
}

/** True when the judge grades the same model that answered (docs/SPEC.md). */
export function isSelfJudged(): boolean {
  return models.judge === models.chat;
}

/** Mean over the scores that are numbers, or null when none is. */
export function meanOfScored(scores: (number | null)[]): number | null {
  const numbers = scores.filter((score): score is number => score !== null);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, score) => sum + score, 0) / numbers.length;
}
