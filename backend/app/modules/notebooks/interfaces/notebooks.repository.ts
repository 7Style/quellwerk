/**
 * What the notebooks module needs from storage, and nothing more.
 *
 * The interface names rows, not Prisma models, for two reasons. The tests can
 * run against an in-memory implementation, which keeps the promise in
 * jest.env.ts that no test opens a database. And the service cannot
 * accidentally reach past it into a relation that belongs to another module.
 */

/** A notebook as this module reads it. Fields other modules own are absent. */
export interface NotebookRow {
  id: string;
  /** Null only for the demo notebook, which belongs to nobody (M8-T1). */
  sessionId: string | null;
  title: string;
  emoji: string | null;
  userSetTitle: boolean;
  summary: string | null;
  suggestedQuestions: unknown;
  /** Measured on a real count-tokens request, never estimated (docs/SPEC.md). */
  tokenCount: number;
  tokenModel: string | null;
  isDemo: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  /**
   * How many sources the notebook holds.
   *
   * Counted by the database in the same query, not carried as a column: a
   * column would be a number that has to be kept right on every add, every
   * failed ingest and every delete, and the first one missed makes the card
   * lie. Prisma's `_count` is a join, and a notebook list is at most a few
   * dozen rows per session.
   */
  sourceCount: number;
}

export interface CreateNotebookData {
  sessionId: string;
  title: string;
}

export interface NotebooksRepository {
  create(data: CreateNotebookData): Promise<NotebookRow>;
  findById(id: string): Promise<NotebookRow | null>;
  /** This session's notebooks plus the demo one, which belongs to nobody. */
  listBySession(sessionId: string): Promise<NotebookRow[]>;
  /**
   * Moves `lastUsedAt` to now. The cleanup job deletes notebooks nobody has
   * touched for seven days (M7-T5), so "touched" has to mean something, and it
   * means a request that named this notebook.
   */
  touch(id: string): Promise<void>;
}
