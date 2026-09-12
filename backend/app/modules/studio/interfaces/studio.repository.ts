/**
 * What the studio module needs from storage and from the notebooks module.
 *
 * `NotebookAccess` is the same shape the sources module declares: studio must
 * not import notebooks (CLAUDE.md), so it states the question it needs answered
 * and modules/index.ts hands over the answer.
 */
import type { ReportFormat } from '../internal/formats.js';

export interface ArtifactRow {
  id: string;
  notebookId: string;
  title: string | null;
  type: string;
  status: string;
  params: { format: ReportFormat; focus: string } | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/** The row plus what only the open report needs. */
export interface ArtifactWithBody extends ArtifactRow {
  segments: unknown;
  promptUsed: string | null;
}

export interface CreateArtifactData {
  notebookId: string;
  type: string;
  idempotencyKey: string;
  params: { format: ReportFormat; focus: string };
}

export interface StudioRepository {
  /**
   * Creates the row, or returns the one that is already there.
   *
   * The unique index on (notebookId, idempotencyKey) is what makes "the same
   * request twice produces one report" true even when two clicks land in the
   * same millisecond. A read-then-write here would be a race with a 150,000
   * token request on the losing side.
   */
  createOrGet(data: CreateArtifactData): Promise<{ artifact: ArtifactRow; created: boolean }>;
  listByNotebook(notebookId: string): Promise<ArtifactRow[]>;
  findById(notebookId: string, artifactId: string): Promise<ArtifactWithBody | null>;
  /** Puts a failed report back in the queue, clearing what the last run left. */
  requeue(artifactId: string): Promise<void>;
}

export interface ReadableNotebook {
  id: string;
}

export interface NotebookAccess {
  /** The notebook when this session may read it, otherwise a throw (404). */
  readable(notebookId: string, sessionId: string): Promise<ReadableNotebook>;
  /**
   * Das Notizbuch, in das dieser Report gehört. Ein Report ist ein
   * Schreibzugriff.
   *
   * **Nicht unbedingt das Notizbuch, nach dem gefragt wurde.** Beim
   * Demo-Notizbuch entsteht hier eine Kopie in der eigenen Sitzung, und der
   * Report gehört in die Kopie (M7-T1). Ab hier gilt `notebook.id`.
   */
  writableOrCopy(notebookId: string, sessionId: string): Promise<ReadableNotebook>;
  /**
   * Wie oben, ohne Kopie: für einen Schreibzugriff, der nichts anlegen kann.
   *
   * Das ist "nochmal versuchen". Es braucht die Zeile, um die es geht, und im
   * Demo-Notizbuch gibt es keine - eine Kopie dafür wäre ein leeres Notizbuch
   * und danach ein 404 auf den Report.
   */
  writable(notebookId: string, sessionId: string): Promise<ReadableNotebook>;
}
