/**
 * Adding a source, and the gate in front of it.
 *
 * Two paths that differ in one thing only: whether the text exists yet.
 *
 *   pasted text  is there. It is normalised at once, counted on a real
 *                count-tokens request, and refused with 413 if the notebook
 *                would go over. The row is written `queued`: its text is done,
 *                but the source guide and the overview still have to run.
 *   an upload    is a file on disk. The worker extracts it (M2-T2), so the
 *                token cap cannot be decided here; the row is written `queued`
 *                with an empty text and no token count.
 *
 * What both share: the source count and a notebook that is already full are
 * refused before anything is written, in both cases.
 */
import { extract, ExtractionError } from '../internal/extract.js';
import { checkCapacity, type CapacityLimits } from '../internal/capacity.js';
import {
  CapacityExceededError,
  EmptySourceError,
  UnsupportedSourceError,
} from '../internal/errors.js';
import type {
  NotebookAccess,
  SourceRow,
  SourcesRepository,
  SourceWithText,
} from '../interfaces/sources.repository.js';

/**
 * Counting tokens needs the model the notebook is measured on and a way to
 * ask. Both are injected; this module never holds an API client (ADR-0004).
 */
export interface SourceTokenCounter {
  /** Tokens one document's text costs, as the API counts them. */
  countTextTokens(title: string, text: string): Promise<number>;
}

export interface SourcesServiceDeps {
  repository: SourcesRepository;
  notebooks: NotebookAccess;
  tokens: SourceTokenCounter;
  limits: CapacityLimits;
  /**
   * Hands the source to the worker. Injected, so this module never imports a
   * queue library and the route stays testable without a Redis.
   *
   * Called after the row exists, never before: a job whose row is not there yet
   * would find nothing and end as "source no longer exists".
   */
  enqueueIngest(source: { sourceId: string; notebookId: string }): Promise<void>;
  /**
   * Throws when today's spend has reached the cap.
   *
   * Called before the row is written, not after: adding a source starts a chain
   * of model calls in the worker, and a budget that is checked once the tokens
   * are spent is an audit rather than a budget (SECURITY.md 7.3).
   */
  assertBudgetLeft(): Promise<void>;
}

export interface PastedSourceInput {
  title: string;
  text: string;
}

export interface UploadedSourceInput {
  title: string;
  kind: string;
  originalName: string;
  mime: string;
  storagePath: string;
}

export class SourcesService {
  constructor(private readonly deps: SourcesServiceDeps) {}

  async list(notebookId: string, sessionId: string): Promise<SourceRow[]> {
    // `readable`, not `writable`. Listing is a read, and asking for write
    // access here hid the demo notebook's own sources from every visitor who
    // did not happen to own it.
    await this.deps.notebooks.readable(notebookId, sessionId);
    return this.deps.repository.listByNotebook(notebookId);
  }

  /**
   * The stored text of one source.
   *
   * Exactly the string that was normalised once at ingest, went to the model
   * and has not been touched since (ADR-0003). The viewer marks character
   * ranges in it, so anything done to it on the way out - trimming, re-wrapping,
   * a different encoding - would move every citation in the notebook.
   *
   * A source that is not ready has no text worth showing and answers 409: the
   * viewer should say "still being read", not draw an empty document.
   */
  async text(notebookId: string, sourceId: string, sessionId: string): Promise<SourceWithText> {
    await this.deps.notebooks.readable(notebookId, sessionId);

    const source = await this.deps.repository.findWithText(notebookId, sourceId);
    if (!source) {
      throw Object.assign(new Error('No such source.'), {
        statusCode: 404,
        errorCode: 'SOURCE_NOT_FOUND',
      });
    }
    if (source.status !== 'ready') {
      throw Object.assign(new Error('This source is not ready yet.'), {
        statusCode: 409,
        errorCode: 'SOURCE_NOT_READY',
      });
    }

    return source;
  }

  async addPasted(
    notebookId: string,
    sessionId: string,
    input: PastedSourceInput
  ): Promise<SourceRow> {
    // Ab hier `target` und nicht `notebookId`: beim Demo-Notizbuch ist das eine
    // frische Kopie dieser Sitzung, und die neue Quelle gehört in die Kopie.
    const notebook = await this.deps.notebooks.writableOrCopy(notebookId, sessionId);
    const target = notebook.id;
    await this.deps.assertBudgetLeft();
    const sourceCount = await this.deps.repository.countByNotebook(target);

    // First gate: no measuring yet. A full notebook and a notebook with fifty
    // sources are both refused without counting a single token.
    this.refuseIfOver(notebook.tokenCount, sourceCount, {});

    // Normalised here and never again (ADR-0003). What this returns is what
    // goes to the model, what the viewer renders, and what offsets point into.
    //
    // `extract` throws its own error, which carries a reason and no HTTP
    // status: it is a domain error, and the worker will catch the same one
    // without an HTTP response anywhere in sight. Turning it into a status is
    // this layer's job.
    let text: string;
    try {
      ({ text } = await extract('paste', input.text));
    } catch (error) {
      throw asHttpError(error);
    }
    if (text.length === 0) throw new EmptySourceError();

    const addedTokens = await this.deps.tokens.countTextTokens(input.title, text);

    // Second gate, now with the real number.
    this.refuseIfOver(notebook.tokenCount, sourceCount, { addedTokens });

    const position = (await this.deps.repository.maxPosition(target)) + 1;
    const source = await this.deps.repository.create({
      notebookId: target,
      position,
      title: input.title,
      kind: 'paste',
      text,
      charCount: text.length,
      tokenCount: addedTokens,
      // The text is done; what is queued is the source guide, and after it the
      // notebook title and the overview (M2-T2).
      status: 'queued',
    });

    await this.deps.repository.addNotebookTokens(target, addedTokens);
    await this.deps.enqueueIngest({ sourceId: source.id, notebookId: target });
    return source;
  }

  async addUploaded(
    notebookId: string,
    sessionId: string,
    input: UploadedSourceInput
  ): Promise<SourceRow> {
    // Ab hier `target` und nicht `notebookId`; siehe `addPasted`.
    const notebook = await this.deps.notebooks.writableOrCopy(notebookId, sessionId);
    const target = notebook.id;
    await this.deps.assertBudgetLeft();
    const sourceCount = await this.deps.repository.countByNotebook(target);

    // The only gate that can run here. The file's tokens are unknown until the
    // worker has extracted it, and that gate lives there (docs/ARCHITECTURE.md).
    this.refuseIfOver(notebook.tokenCount, sourceCount, {});

    const position = (await this.deps.repository.maxPosition(target)) + 1;
    const source = await this.deps.repository.create({
      notebookId: target,
      position,
      title: input.title,
      kind: input.kind,
      text: '',
      charCount: 0,
      tokenCount: 0,
      originalName: input.originalName,
      mime: input.mime,
      storagePath: input.storagePath,
      status: 'queued',
    });

    await this.deps.enqueueIngest({ sourceId: source.id, notebookId });
    return source;
  }

  private refuseIfOver(
    tokenCount: number,
    sourceCount: number,
    request: { addedTokens?: number }
  ): void {
    const refusal = checkCapacity({ sourceCount, tokenCount }, request, this.deps.limits);
    if (refusal) throw new CapacityExceededError(refusal);
  }
}

/** Maps an extraction failure to the status that describes it. */
function asHttpError(error: unknown): Error {
  if (!(error instanceof ExtractionError)) return error as Error;

  switch (error.reason) {
    case 'empty':
      return new EmptySourceError();
    case 'no-text-layer':
      return new UnsupportedSourceError(
        'That PDF has no text layer, only images. Quellwerk does not read scans.'
      );
    case 'unsupported':
      return new UnsupportedSourceError(error.message);
    case 'broken':
      return new UnsupportedSourceError('That file could not be read.');
    default:
      return error;
  }
}
