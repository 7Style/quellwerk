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

export interface SourcesRepository {
  countByNotebook(notebookId: string): Promise<number>;
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
}
