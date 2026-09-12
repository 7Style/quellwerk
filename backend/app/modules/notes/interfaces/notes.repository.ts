/**
 * What the notes module needs from storage and from the rest of the application.
 *
 * The same shape the studio and sources modules declare: notes must not import
 * chat, sources or notebooks (CLAUDE.md), so it states the three questions it
 * needs answered and `modules/index.ts` hands over the answers.
 */

/**
 * A segment of a saved answer: text with the citations that were verified when
 * the answer was written.
 *
 * Declared here rather than imported from the chat module, which owns the
 * resolver. The shape is `VerifiedCitation`, and it has to stay that way: the
 * interface draws a chip in a note exactly as it draws one in an answer, and a
 * chip that no longer matches the stored text is the one thing this product
 * must not render (ADR-0003).
 */
export interface NoteSegment {
  text: string;
  citations: Array<{
    sourceId: string;
    sourceTitle: string;
    start: number;
    end: number;
    text: string;
    page: number | null;
  }>;
}

export interface NoteRow {
  id: string;
  notebookId: string;
  title: string;
  markdown: string;
  /** Null for a note somebody wrote; the answer's segments for a saved one. */
  segments: NoteSegment[] | null;
  /** Which answer this came from, or null. Provenance, not a foreign key. */
  fromMessageId: string | null;
  createdAt: Date;
}

export interface CreateNoteData {
  notebookId: string;
  title: string;
  markdown: string;
  segments?: NoteSegment[] | null;
  fromMessageId?: string | null;
}

export interface NotesRepository {
  create(data: CreateNoteData): Promise<NoteRow>;
  listByNotebook(notebookId: string): Promise<NoteRow[]>;
  findById(notebookId: string, noteId: string): Promise<NoteRow | null>;
  /** Deletes the row. The source a note was converted into is not touched. */
  remove(notebookId: string, noteId: string): Promise<void>;
}

export interface ReadableNotebook {
  id: string;
}

export interface NotebookAccess {
  readable(notebookId: string, sessionId: string): Promise<ReadableNotebook>;
  /**
   * Das Notizbuch, in das diese Notiz gehört.
   *
   * Nicht unbedingt das, nach dem gefragt wurde: im Demo-Notizbuch entsteht
   * hier eine Kopie der eigenen Sitzung (Copy-on-first-write, M7-T1).
   */
  writableOrCopy(notebookId: string, sessionId: string): Promise<ReadableNotebook>;
}

/**
 * The stored segments of one answer, or null when there is no such message in
 * this notebook.
 *
 * This is why "Save to note" sends a message id and not the segments: a client
 * that sent its own citations could store chips that no resolver ever checked,
 * and a note renders them exactly like an answer does. The server copies what
 * it verified when the answer was written.
 */
export type LoadMessageSegments = (
  notebookId: string,
  messageId: string
) => Promise<{ segments: NoteSegment[] } | null>;

/**
 * Turns text into a source of this notebook, through the same path as pasted
 * text: normalise once, count the tokens against the notebook, queue the guide.
 *
 * Injected rather than imported, because the sources module is a module. What
 * comes back is the source id, so the answer can say which source was created.
 */
export type CreateSourceFromText = (input: {
  notebookId: string;
  sessionId: string;
  title: string;
  text: string;
}) => Promise<{ id: string; notebookId: string }>;
