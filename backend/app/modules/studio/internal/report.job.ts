/**
 * Writing one report.
 *
 * The same path as a chat turn and deliberately so: the chat request builder,
 * the same documents, the same effort, citations on, and the same resolver
 * checking every chip against the stored text before it is stored (ADR-0003).
 * A report is an answer that nobody is sitting in front of, which is the only
 * reason it runs here instead of in the request.
 *
 * The job is a plain function with its dependencies injected. It knows nothing
 * about BullMQ, Prisma or the SDK, which is what lets the tests below it run
 * without any of the three.
 */
import { FORMATS, type ReportFormat } from './formats.js';

/**
 * A citation as a report stores it.
 *
 * Declared here rather than imported from the chat module, which owns the
 * resolver: modules do not import each other (CLAUDE.md). The shape is
 * `VerifiedCitation`, and it has to stay that way - the worker hands the chat
 * resolver's output straight into `finish`, and the interface draws a chip in a
 * report exactly as it draws one in an answer.
 */
export interface ReportCitation {
  sourceId: string;
  sourceTitle: string;
  start: number;
  end: number;
  text: string;
  page: number | null;
}

export interface ReportPayload {
  artifactId: string;
  notebookId: string;
}

/** A source as the job needs it, in the order the builder will emit. */
export interface ReportSource {
  id: string;
  position: number;
  title: string;
  kind: string;
  text: string;
  pageCount: number | null;
}

export interface ReportRow {
  id: string;
  notebookId: string;
  type: string;
  status: string;
  params: { format: ReportFormat; focus: string } | null;
}

export interface WrittenReport {
  segments: Array<{ text: string; citations: ReportCitation[] }>;
  /** What was actually sent, for "View prompt used". */
  promptUsed: string;
  droppedCitations: number;
}

export interface ReportDeps {
  getArtifact(id: string): Promise<ReportRow | null>;
  readySources(notebookId: string): Promise<ReportSource[]>;
  /**
   * Throws when today's budget is spent. Asked again here, in the worker.
   *
   * The route checks it too, but a check before the row is written only says
   * what was true when the reader clicked. Twenty reports asked for inside a
   * second all pass that check and then run one after another, each of them a
   * call over the whole notebook; this is the one that sees what the ones
   * before it spent.
   */
  assertBudget(): Promise<void>;
  /** Writes `heartbeatAt` and `startedAt`. Called before the model, not after. */
  start(artifactId: string): Promise<void>;
  /** Runs the model and verifies every citation. Throws on a model failure. */
  write(format: ReportFormat, focus: string, sources: ReportSource[]): Promise<WrittenReport>;
  finish(artifactId: string, report: WrittenReport & { title: string }): Promise<void>;
  fail(artifactId: string, reason: string): Promise<void>;
  onError(error: unknown, artifactId: string): void;
}

export type ReportResult =
  | { status: 'written'; citations: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * One sentence, from a fixed list, for the row a reader sees.
 *
 * Never the library's message. An upstream error can carry the request, and the
 * request carries the documents; `source.error` learned that in M2 and this is
 * the same rule for `artifact.error`.
 */
function reasonFor(error: unknown): string {
  // Not a model failure and not one a retry in the next minute fixes. It says
  // what happened rather than "could not be written", because the reader can
  // do something about the wait but nothing about the sentence.
  if ((error as { errorCode?: string } | null)?.errorCode === 'BUDGET_SPENT') {
    return 'The daily budget for this demo is spent. Try again tomorrow.';
  }

  const status = (error as { status?: number } | null)?.status;
  if (status === 429 || status === 529) return 'The model was busy. Try again in a moment.';
  if (typeof status === 'number' && status >= 500) {
    return 'The model service had a problem. Try again in a moment.';
  }
  if (typeof status === 'number' && status >= 400) return 'The report could not be requested.';
  return 'The report could not be written.';
}

export async function runReportJob(
  deps: ReportDeps,
  payload: ReportPayload
): Promise<ReportResult> {
  const artifact = await deps.getArtifact(payload.artifactId);

  // Deleted while the job sat in the queue, or the notebook went with it.
  if (!artifact) return { status: 'skipped', reason: 'artifact no longer exists' };

  // The idempotency that survives a retry. The unique index on
  // (notebookId, idempotencyKey) stops a second row, and the job id stops a
  // second enqueue; this stops a second run after a crash, which neither can.
  if (artifact.status === 'ready') return { status: 'skipped', reason: 'already written' };

  const params = artifact.params;
  if (!params) {
    await deps.fail(payload.artifactId, 'The report could not be written.');
    return { status: 'failed', reason: 'no params on the row' };
  }

  try {
    await deps.start(payload.artifactId);

    const sources = await deps.readySources(artifact.notebookId);
    if (sources.length === 0) {
      // Not an error the reader caused, and not one a retry fixes. A report of
      // an empty notebook would be a page about nothing.
      await deps.fail(payload.artifactId, 'This notebook has no readable sources yet.');
      return { status: 'failed', reason: 'no ready sources' };
    }

    // Immediately before the call, not at the top of the job: what matters is
    // what has been spent by the time the money is about to be spent.
    await deps.assertBudget();

    const report = await deps.write(params.format, params.focus, sources);

    await deps.finish(payload.artifactId, { ...report, title: FORMATS[params.format].label });

    return { status: 'written', citations: report.segments.reduce(countCitations, 0) };
  } catch (error) {
    // The real error with its stack goes to the log; the row gets a sentence.
    deps.onError(error, payload.artifactId);
    const reason = reasonFor(error);
    await deps.fail(payload.artifactId, reason);
    return { status: 'failed', reason };
  }
}

function countCitations(total: number, segment: { citations: unknown[] }): number {
  return total + segment.citations.length;
}
