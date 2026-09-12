/**
 * What the sources module needs from storage and from the notebooks module.
 *
 * `NotebookAccess` is the interesting half. The sources module must not import
 * the notebooks module (CLAUDE.md), but adding a source to a notebook that
 * belongs to someone else has to be impossible. So it declares the question it
 * needs answered, and modules/index.ts hands it the answer.
 */

export interface SourceRow {
  id: string;
  notebookId: string;
  position: number;
  title: string;
  kind: string;
  status: string;
  step: string | null;
  error: string | null;
  charCount: number;
  tokenCount: number;
  createdAt: Date;
}

export interface CreateSourceData {
  notebookId: string;
  position: number;
  title: string;
  kind: string;
  /** Empty for an upload: the text only exists after the worker extracted it. */
  text: string;
  charCount: number;
  tokenCount: number;
  originalName?: string | null;
  mime?: string | null;
  storagePath?: string | null;
  status: string;
}

/** A source with the one field the list deliberately leaves out. */
export interface SourceWithText extends SourceRow {
  text: string;
}

export interface SourcesRepository {
  countByNotebook(notebookId: string): Promise<number>;
  /**
   * One source with its stored text, scoped to its notebook.
   *
   * `notebookId` is part of the query and not checked afterwards: a source id
   * from another notebook must not resolve at all, and a filter in the WHERE
   * clause cannot be forgotten the way a comparison after the fact can.
   */
  findWithText(notebookId: string, sourceId: string): Promise<SourceWithText | null>;
  /** Highest position in use, or 0 for an empty notebook. */
  maxPosition(notebookId: string): Promise<number>;
  create(data: CreateSourceData): Promise<SourceRow>;
  listByNotebook(notebookId: string): Promise<SourceRow[]>;
  /** Adds to the notebook's measured total when a source is accepted. */
  addNotebookTokens(notebookId: string, tokens: number): Promise<void>;
}

export interface WritableNotebook {
  id: string;
  tokenCount: number;
}

export interface NotebookAccess {
  /**
   * The notebook when this session may write to it, otherwise a throw from the
   * notebooks module (404, never 403). Returning null instead would tempt a
   * caller to carry on with a notebook it does not own.
   */
  writable(notebookId: string, sessionId: string): Promise<WritableNotebook>;
  /**
   * The notebook when this session may read it, which includes the demo
   * notebook (SECURITY.md 7.2). Listing sources and opening one are reads, and
   * asking `writable` for them hid the demo notebook's own documents from
   * every visitor.
   */
  readable(notebookId: string, sessionId: string): Promise<WritableNotebook>;
}
