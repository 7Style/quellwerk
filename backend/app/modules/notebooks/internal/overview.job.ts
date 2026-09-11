/**
 * The overview job: summary, themes and four suggested questions over all ready
 * sources of a notebook.
 *
 * It is queued with a delay and a fixed job id per notebook, so three sources
 * added within a few seconds produce one overview instead of three
 * (docs/ARCHITECTURE.md). The debounce itself lives in services/queue; what
 * this file guarantees is that a run which happens anyway is harmless: it reads
 * the sources as they are now and overwrites the notebook's overview fields.
 *
 * No BullMQ here either. Everything it needs is handed in.
 */
import { z } from 'zod';

/**
 * No count constraint on `suggestedQuestions`, although there have to be
 * exactly four. A structured-output schema's counts are stripped by the API
 * rather than honoured, so the number is enforced below (prompts/README.md).
 */
export const notebookOverviewSchema = z.object({
  summary: z.string(),
  themes: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
});
export type NotebookOverview = z.infer<typeof notebookOverviewSchema>;

export interface OverviewPayload {
  notebookId: string;
}

export interface OverviewSource {
  id: string;
  position: number;
  title: string;
  kind: string;
  text: string;
}

export interface OverviewDeps {
  /** Ready sources only: a source still being ingested has no text to read. */
  readySources(notebookId: string): Promise<OverviewSource[]>;
  writeOverview(sources: OverviewSource[]): Promise<NotebookOverview>;
  saveOverview(notebookId: string, overview: NotebookOverview): Promise<void>;
}

export interface OverviewResult {
  status: 'written' | 'skipped';
  reason?: string;
  questions?: number;
}

/** docs/SPEC.md: the header shows four, so four is what is kept. */
export const SUGGESTED_QUESTION_COUNT = 4;
const MAX_THEMES = 6;

export async function runOverviewJob(
  deps: OverviewDeps,
  payload: OverviewPayload
): Promise<OverviewResult> {
  const sources = await deps.readySources(payload.notebookId);

  // Nothing ready yet. The job that follows the next finished source will run
  // with something to read; writing an overview of an empty notebook would put
  // a summary of nothing on the header.
  if (sources.length === 0) {
    return { status: 'skipped', reason: 'no ready sources' };
  }

  const overview = await deps.writeOverview(sources);

  const trimmed: NotebookOverview = {
    summary: overview.summary,
    themes: overview.themes.slice(0, MAX_THEMES),
    // Cut to four rather than refused at three: the header shows what there is,
    // and an overview that fails because the model offered three questions
    // would cost the whole notebook its summary over a cosmetic count.
    suggestedQuestions: overview.suggestedQuestions.slice(0, SUGGESTED_QUESTION_COUNT),
  };

  await deps.saveOverview(payload.notebookId, trimmed);

  return { status: 'written', questions: trimmed.suggestedQuestions.length };
}
