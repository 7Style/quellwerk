/**
 * The ingest job: from an accepted source row to a source the chat can use.
 *
 * The chain is fetch, extract, normalise, page map, token gate, source guide,
 * and for the first source of a notebook also its title (docs/ARCHITECTURE.md).
 * Every step writes `step` and `heartbeatAt` on the row, so work that died
 * halfway is found through the (status, heartbeatAt) index instead of a job
 * table.
 *
 * Two properties this file exists to keep:
 *
 *   idempotent. Running it twice over the same source produces one result. A
 *   row that is already `ready` is left alone and the job returns; BullMQ's
 *   dedupe over the job id is the first line of defence, this is the one that
 *   holds when a job is retried after a crash.
 *
 *   terminal. Every path ends in `ready` or `failed` with a reason. A source
 *   stuck on `queued` is a spinner that never stops, which the spec forbids
 *   outright (docs/SPEC.md, "Kern-Interaktionen").
 *
 * It takes BullMQ nowhere. What it needs is handed in, which is what lets it be
 * tested without a Redis.
 */
import { z } from 'zod';

import { extract, ExtractionError, type SourceKind } from './extract.js';
import type { PageSpan } from './pages.js';

/** The steps, in order. They are written to the row and shown in the UI. */
export const INGEST_STEPS = ['extract', 'measure', 'guide', 'title', 'done'] as const;
export type IngestStep = (typeof INGEST_STEPS)[number];

export interface IngestPayload {
  sourceId: string;
  notebookId: string;
}

/** The source as the job reads and writes it. */
export interface IngestSourceRow {
  id: string;
  notebookId: string;
  position: number;
  title: string;
  kind: SourceKind;
  status: string;
  text: string;
  /** Non-zero when the route already measured it, which is the pasted path. */
  tokenCount: number;
  storagePath: string | null;
}

export interface IngestSourceUpdate {
  status?: string;
  step?: IngestStep | null;
  error?: string | null;
  text?: string;
  charCount?: number;
  tokenCount?: number;
  pages?: PageSpan[];
  guide?: unknown;
}

/**
 * The guide the fast model writes per source. No length or count constraints:
 * the API strips them from a structured-output schema rather than honouring
 * them, so "three to eight topics" is enforced below, in code
 * (prompts/README.md).
 */
export const sourceGuideSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string()),
  language: z.string(),
  hasInstructions: z.boolean(),
});
export type SourceGuide = z.infer<typeof sourceGuideSchema>;

export const notebookTitleSchema = z.object({
  title: z.string(),
  emoji: z.string(),
});
export type NotebookTitle = z.infer<typeof notebookTitleSchema>;

export interface IngestDeps {
  /** Reads the row. Returns null when it was deleted while the job waited. */
  getSource(sourceId: string): Promise<IngestSourceRow | null>;
  updateSource(sourceId: string, update: IngestSourceUpdate): Promise<void>;
  /** Writes `heartbeatAt` and `step`. Called before every step, not after. */
  heartbeat(sourceId: string, step: IngestStep): Promise<void>;
  /** Reads an uploaded file from the volume. */
  readFile(storagePath: string): Promise<Buffer>;
  /**
   * Removes the uploaded file once its text is stored.
   *
   * The text is the source from then on: it is what goes to the model, what the
   * viewer renders and what offsets point into (ADR-0003). Keeping the original
   * would mean keeping a second copy of every source for the life of the
   * notebook, and docs/KNOWN-LIMITS.md already says the upload volume is not
   * backed up because the text in Postgres is the thing that matters.
   */
  discardFile(storagePath: string): Promise<void>;
  /** Tokens for one source's text, measured on a real request. */
  countTextTokens(title: string, text: string): Promise<number>;
  addNotebookTokens(notebookId: string, tokens: number): Promise<void>;
  /**
   * Asks for the right to write the notebook title, and answers once.
   *
   * This went through two wrong versions, both caught on the running stack and
   * neither by a test:
   *
   *   "does this notebook have exactly one source" - both rows exist before
   *   either job starts, so with two sources the answer was two on both sides
   *   and the notebook got no title at all.
   *
   *   "am I the first source to finish" - the worker runs two jobs at once,
   *   both read zero finished sources in the same moment, and both wrote a
   *   title. One notebook, two model calls.
   *
   * A count cannot answer this: any read followed by a write is a race when two
   * jobs run side by side. The claim has to be atomic, so it is, and this file
   * does not care whether that happens in Redis or in a row.
   */
  claimTitle(notebookId: string): Promise<boolean>;
  /** Runs the source-guide prompt over this one source. */
  writeGuide(source: { title: string; text: string; kind: string }): Promise<SourceGuide>;
  /**
   * Runs the notebook-title prompt. Only for the first source.
   * @param language an English language name, taken from the guide that was
   * just written. A German source gets a German notebook title.
   */
  writeNotebookTitle(
    source: { title: string; text: string; kind: string },
    language: string
  ): Promise<NotebookTitle>;
  setNotebookTitle(notebookId: string, title: NotebookTitle): Promise<void>;
  /** Queues the overview, debounced. Called once, at the end. */
  requestOverview(notebookId: string): Promise<void>;
  maxTokensPerNotebook: number;
  /** Where the real error goes. Optional so a test does not have to care. */
  onError?(error: unknown, sourceId: string): void;
  /** The notebook's measured total, without this source. */
  notebookTokens(notebookId: string): Promise<number>;
}

export interface IngestResult {
  status: 'ready' | 'failed' | 'skipped';
  reason?: string;
  tokens?: number;
}

/**
 * Few enough to scan. Enforced here and not in the schema, because a
 * structured-output schema's count constraints are stripped by the API rather
 * than honoured (prompts/README.md).
 */
const MAX_TOPICS = 8;

function trimGuide(guide: SourceGuide): SourceGuide {
  return { ...guide, topics: guide.topics.slice(0, MAX_TOPICS) };
}

export async function runIngestJob(deps: IngestDeps, payload: IngestPayload): Promise<IngestResult> {
  const source = await deps.getSource(payload.sourceId);

  // Deleted while the job sat in the queue. Not an error: there is nothing to
  // do and nothing to report to.
  if (!source) return { status: 'skipped', reason: 'source no longer exists' };

  // The idempotency that survives a retry. BullMQ's job id stops a second
  // enqueue; this stops a second run of the same job after a crash, which the
  // job id cannot.
  if (source.status === 'ready') return { status: 'skipped', reason: 'already ready' };

  try {
    // ---- extract ---------------------------------------------------------
    await deps.heartbeat(source.id, 'extract');

    let text = source.text;
    let pages: PageSpan[] = [];
    /** Set once the bytes have become text; the file is released after the store. */
    let extractedFrom: string | null = null;

    if (text.length === 0) {
      if (!source.storagePath) {
        return fail(deps, source.id, 'the source has neither text nor a file');
      }
      const buffer = await deps.readFile(source.storagePath);
      const extracted = await extract(source.kind, buffer);
      text = extracted.text;
      pages = extracted.pages;
      extractedFrom = source.storagePath;
    }

    // ---- measure ---------------------------------------------------------
    // Only when nobody has measured yet. Pasted text was counted by the route,
    // which is where its 413 comes from, and counting again here would add the
    // same tokens to the notebook a second time. The upload path arrives with
    // a zero and is measured for the first time right here.
    let tokens = source.tokenCount;

    if (tokens === 0) {
      await deps.heartbeat(source.id, 'measure');
      tokens = await deps.countTextTokens(source.title, text);
      const already = await deps.notebookTokens(source.notebookId);

      // The same cap as the route, at the point where the number first exists
      // for an uploaded file. Here it ends the job rather than a request: the
      // response is long gone (docs/ARCHITECTURE.md).
      if (already + tokens > deps.maxTokensPerNotebook) {
        return fail(
          deps,
          source.id,
          `This source has ${tokens.toLocaleString('en-US')} tokens and does not fit: the notebook would come to ` +
            `${(already + tokens).toLocaleString('en-US')}, over the limit of ${deps.maxTokensPerNotebook.toLocaleString('en-US')}.`
        );
      }

      await deps.updateSource(source.id, {
        text,
        charCount: text.length,
        tokenCount: tokens,
        pages,
      });
      await deps.addNotebookTokens(source.notebookId, tokens);

      // The text is stored, so the bytes have done their job. Released here and
      // not in a finally: on a failure the file stays, which is what lets a
      // failed source be retried without asking for the upload again.
      if (extractedFrom) await deps.discardFile(extractedFrom);
    }

    // ---- source guide ----------------------------------------------------
    await deps.heartbeat(source.id, 'guide');
    const guide = trimGuide(await deps.writeGuide({ title: source.title, text, kind: source.kind }));

    // Too few topics is not a failure. A three-line glossary entry has fewer
    // than three and is a perfectly good source; the guide is a convenience,
    // and a source is not held back because its summary came out thin.
    await deps.updateSource(source.id, { guide });

    // ---- notebook title, written by whoever claims it first --------------
    if (await deps.claimTitle(source.notebookId)) {
      await deps.heartbeat(source.id, 'title');
      const title = await deps.writeNotebookTitle(
        { title: source.title, text, kind: source.kind },
        guide.language
      );
      await deps.setNotebookTitle(source.notebookId, title);
    }

    // ---- done ------------------------------------------------------------
    await deps.heartbeat(source.id, 'done');
    await deps.updateSource(source.id, { status: 'ready', step: null, error: null });

    // Debounced, so three sources added together produce one overview.
    await deps.requestOverview(source.notebookId);

    return { status: 'ready', tokens };
  } catch (error) {
    // The error object goes to the caller, which logs it; only the sentence
    // below reaches the row and the API response.
    deps.onError?.(error, source.id);
    return fail(deps, source.id, reasonFor(error));
  }
}

/**
 * Ends the job on the row. Called on every failure path, so a source can never
 * be left on `queued` with nothing running.
 */
async function fail(deps: IngestDeps, sourceId: string, reason: string): Promise<IngestResult> {
  await deps.updateSource(sourceId, { status: 'failed', step: null, error: reason });
  return { status: 'failed', reason };
}

/**
 * A reason a person can act on, and only from a list this file controls.
 *
 * The previous version passed `error.message` through for anything that was not
 * an ExtractionError. That message lands in `source.error`, which the API
 * returns and the UI shows. A Prisma failure on `updateSource` carries the
 * `data` of the statement in its message, and `data` holds the normalised
 * source text: the route would have handed a slice of the user's document back
 * in an error response, against a rule CLAUDE.md marks as non-negotiable.
 *
 * The real message is not lost. The caller logs the error object itself, where
 * it belongs; what reaches the row is a sentence somebody can act on.
 */
function reasonFor(error: unknown): string {
  if (error instanceof ExtractionError) {
    switch (error.reason) {
      case 'no-text-layer':
        return 'That PDF has no text layer, only images. Quellwerk does not read scans.';
      case 'empty':
        return 'There is no text in that source.';
      case 'unsupported':
        return 'Quellwerk does not read that file type.';
      default:
        return 'That file could not be read.';
    }
  }
  return 'Something went wrong while preparing this source. Try adding it again.';
}
