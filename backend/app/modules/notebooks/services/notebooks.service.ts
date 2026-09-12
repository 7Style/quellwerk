/**
 * Notebooks, always scoped to the session that asked.
 *
 * Every read goes through one of two methods, and both of them take a session
 * id. That is the whole access model (ADR-0005): there is no path to a notebook
 * that does not name whose it is, so a route cannot forget to check.
 */
import type { NotebookRow, NotebooksRepository } from '../interfaces/notebooks.repository.js';
import { NotebookNotFoundError } from '../internal/errors.js';
import { writeDecision } from '../internal/copy-on-write.js';

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
   * Das Notizbuch, in das dieser Schreibzugriff gehört.
   *
   * Für ein eigenes Notizbuch ist das es selbst. Für das Demo-Notizbuch ist es
   * eine Kopie in der eigenen Sitzung, die hier entsteht: es gehört keiner
   * Sitzung, und ein Schreibzugriff darin würde verändern, was alle anderen
   * sehen (SECURITY.md 7.2).
   *
   * **Der Rückgabewert ist deshalb nicht immer das Notizbuch, nach dem gefragt
   * wurde.** Jeder Aufrufer muss ab hier mit `notebook.id` weiterarbeiten und
   * nicht mit der Id aus der Route, sonst schreibt er in das Original, dessen
   * Kopie er gerade bekommen hat. Die Route gibt die neue Id mit der Antwort
   * zurück, und die Oberfläche wechselt dorthin.
   */
  async writableOrCopy(id: string, sessionId: string): Promise<NotebookRow> {
    const notebook = await this.deps.repository.findById(id);
    const decision = writeDecision(notebook, sessionId);

    if (decision.kind === 'refuse') throw new NotebookNotFoundError();
    if (decision.kind === 'copy') return this.deps.repository.copyForSession(id, sessionId);
    return notebook as NotebookRow;
  }

  /**
   * Wie oben, aber ohne Kopie: für einen Schreibzugriff, der nichts anlegen
   * kann.
   *
   * Das ist "nochmal versuchen" an einem fehlgeschlagenen Report. Eine Kopie
   * dafür anzulegen hätte ein leeres Notizbuch zur Folge, in dem die Zeile
   * fehlt, um die es ging.
   */
  async writable(id: string, sessionId: string): Promise<NotebookRow> {
    const notebook = await this.deps.repository.findById(id);
    const decision = writeDecision(notebook, sessionId, false);

    if (decision.kind !== 'own') throw new NotebookNotFoundError();
    return notebook as NotebookRow;
  }

  async touch(id: string): Promise<void> {
    await this.deps.repository.touch(id);
  }
}
