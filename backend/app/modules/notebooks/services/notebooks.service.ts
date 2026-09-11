/**
 * Notebooks, always scoped to the session that asked.
 *
 * Every read goes through one of two methods, and both of them take a session
 * id. That is the whole access model (ADR-0005): there is no path to a notebook
 * that does not name whose it is, so a route cannot forget to check.
 */
import type { NotebookRow, NotebooksRepository } from '../interfaces/notebooks.repository.js';
import { NotebookNotFoundError } from '../internal/errors.js';

export interface NotebooksServiceDeps {
  repository: NotebooksRepository;
}

export class NotebooksService {
  constructor(private readonly deps: NotebooksServiceDeps) {}

  async create(sessionId: string, title: string): Promise<NotebookRow> {
    return this.deps.repository.create({ sessionId, title });
  }

  async list(sessionId: string): Promise<NotebookRow[]> {
    return this.deps.repository.listBySession(sessionId);
  }

  /**
   * A notebook this session may read: its own, or the demo notebook, which is
   * readable by everyone (SECURITY.md 7.2).
   *
   * Throws rather than returning null, because every caller would otherwise
   * write the same three lines and one of them would eventually write two.
   */
  async readable(id: string, sessionId: string): Promise<NotebookRow> {
    const notebook = await this.deps.repository.findById(id);
    if (!notebook) throw new NotebookNotFoundError();
    if (notebook.isDemo) return notebook;
    if (notebook.sessionId !== sessionId) throw new NotebookNotFoundError();
    return notebook;
  }

  /**
   * A notebook this session may write to. The demo notebook is not one of them:
   * it is read-only until copy-on-first-write copies it into the caller's own
   * session (M7-T1), and until that exists a write to it must not happen at all
   * rather than happen to the original.
   */
  async writable(id: string, sessionId: string): Promise<NotebookRow> {
    const notebook = await this.deps.repository.findById(id);
    if (!notebook) throw new NotebookNotFoundError();
    if (notebook.sessionId !== sessionId) throw new NotebookNotFoundError();
    return notebook;
  }

  async touch(id: string): Promise<void> {
    await this.deps.repository.touch(id);
  }
}
