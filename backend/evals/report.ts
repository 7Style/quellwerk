/**
 * Turns a run into the two things a run has to leave behind: a table a human
 * reads now and a JSON file a later run can be compared against.
 *
 * The table names the answerer on its first line. A citation validity of 100
 * percent means something entirely different when it comes from a fixture than
 * when it comes from the live route, and a number without that word next to it
 * will end up in a README as a claim about the product.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EVALS_DIR } from './golden.js';
import type { JudgeScores } from './judges.js';

export const RESULTS_DIR = path.join(EVALS_DIR, 'results');

/** What went wrong with one citation. Offsets and lengths only, never the text. */
export interface InvalidCitation {
  file: string;
  start: number;
  end: number;
  citedLength: number;
  sliceLength: number;
  /** `mismatch` = the slice is a different string; `out-of-range` = the range is not in the text. */
  kind: 'mismatch' | 'out-of-range' | 'unknown-file';
}

export interface ItemOutcome {
  id: string;
  type: string;
  split: string;
  lang: string;
  citationsTotal: number;
  citationsValid: number;
  invalid: InvalidCitation[];
  refused: boolean;
  /** True when a refusal was right, false when it was wrong, null when the item is not about refusing. */
  abstention: boolean | null;
  /** A refusal that carries citations. Contradicts the spec outright. */
  citedWhileRefusing: boolean;
  scores: JudgeScores;
  latencyMs: number;
  error?: string;
}

export interface RunMetrics {
  citationsTotal: number;
  citationsValid: number;
  /** Null when the run produced no citation at all, rather than a misleading 1. */
  citationValidity: number | null;
  unanswerableTotal: number;
  unanswerableRefused: number;
  abstentionAccuracy: number | null;
  answerableTotal: number;
  falseRefusals: number;
  citedWhileRefusing: number;
  correctness: number | null;
  faithfulness: number | null;
}

export interface RunReport {
  mode: string;
  answerer: string;
  callsModel: boolean;
  goldenFile: string;
  startedAt: string;
  durationMs: number;
  items: ItemOutcome[];
  metrics: RunMetrics;
  /** Notes that belong to the run itself: a fallback that was taken, a judge that declined. */
  notes: string[];
}

function percent(value: number | null): string {
  return value === null ? '     -' : `${(value * 100).toFixed(1).padStart(5)}%`;
}

function ratio(value: number | null): string {
  return value === null ? '     -' : value.toFixed(2).padStart(6);
}

export function formatReport(report: RunReport): string {
  const { metrics: m } = report;
  const lines: string[] = [];

  lines.push('');
  lines.push(`Eval ${report.mode}  |  answerer: ${report.answerer}${report.callsModel ? '' : ' (no model called)'}`);
  lines.push(`golden: ${report.goldenFile}  |  items: ${report.items.length}  |  ${(report.durationMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('  metric                     value    basis');
  lines.push('  ------------------------------------------------------------');
  lines.push(`  citation validity        ${percent(m.citationValidity)}    ${m.citationsValid}/${m.citationsTotal} citations`);
  lines.push(`  abstention accuracy      ${percent(m.abstentionAccuracy)}    ${m.unanswerableRefused}/${m.unanswerableTotal} unanswerable items`);
  lines.push(`  false refusals           ${String(m.falseRefusals).padStart(6)}    of ${m.answerableTotal} answerable items`);
  lines.push(`  citations on a refusal   ${String(m.citedWhileRefusing).padStart(6)}    must be 0`);
  lines.push(`  correctness              ${percent(m.correctness)}    judge`);
  lines.push(`  faithfulness             ${ratio(m.faithfulness)}    judge, refusals excluded`);
  lines.push('');
  lines.push('  Thresholds: docs/SPEC.md, "Schwellen fuer die Evals". They are not repeated here.');

  const broken = report.items.filter((item) => item.invalid.length > 0 || item.citedWhileRefusing);
  if (broken.length > 0) {
    lines.push('');
    lines.push(`  ${broken.length} item(s) with a citation problem:`);
    for (const item of broken) {
      if (item.citedWhileRefusing) {
        lines.push(`    ${item.id}: refused and still carried ${item.citationsTotal} citation(s)`);
      }
      for (const invalid of item.invalid) {
        lines.push(
          `    ${item.id}: ${invalid.kind} in ${invalid.file} [${invalid.start},${invalid.end}) ` +
            `cited ${invalid.citedLength} chars, slice ${invalid.sliceLength} chars`
        );
      }
    }
  }

  const failed = report.items.filter((item) => item.error);
  if (failed.length > 0) {
    lines.push('');
    lines.push(`  ${failed.length} item(s) did not produce an answer:`);
    for (const item of failed) lines.push(`    ${item.id}: ${item.error ?? ''}`);
  }

  if (report.notes.length > 0) {
    lines.push('');
    for (const note of report.notes) lines.push(`  note: ${note}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Writes the run next to its siblings. The name sorts chronologically, because
 * the first thing anyone does with a results directory is look at the newest
 * two and subtract.
 */
export async function writeResults(report: RunReport): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const file = path.join(RESULTS_DIR, `${stamp}-${report.mode}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}
