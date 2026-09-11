/**
 * The seam between the harness and whatever produces an answer.
 *
 * Three implementations over the life of the project: fixtures (M1, recorded
 * JSON, no API key), the stub (M1-T4, derives answers from the golden set and
 * can be told to lie), and the live route (M3-T5). The runner never knows which
 * one it holds, which is the point: the numbers are produced by the same code
 * path whether they come from a fixture or from the API.
 */
import type { GoldenItem } from '../golden.js';

/**
 * A citation as the harness checks it: a character range into the stored text
 * of one corpus file, plus the text the model claims stands there.
 *
 * The file name stands in for `document_index` here. The live answerer maps the
 * index through the request builder's ordered sourceId list (prompts/README.md)
 * before it gets here, so the harness compares against a file it can open.
 */
export interface EvalCitation {
  file: string;
  start: number;
  end: number;
  citedText: string;
}

export interface EvalAnswer {
  text: string;
  citations: EvalCitation[];
  /** Present only when a model was actually called. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  /** Wall clock for the call, milliseconds. Zero for a fixture. */
  latencyMs?: number;
}

export interface Answerer {
  /** Goes into the results file and onto the report, so a number is never orphaned from its source. */
  readonly name: string;
  /** True when a model was called; false for fixtures and stubs. */
  readonly callsModel: boolean;
  answer(item: GoldenItem): Promise<EvalAnswer>;
}
