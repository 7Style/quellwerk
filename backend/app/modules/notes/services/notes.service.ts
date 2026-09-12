/**
 * Notizen, immer auf die Sitzung begrenzt, die fragt.
 *
 * Vier Dinge, die docs/SPEC.md nennt: eine Notiz anlegen, eine Antwort als
 * Notiz sichern, eine Notiz in eine Quelle verwandeln, eine Notiz löschen.
 *
 * Das Sichern ist das interessante. Eine Antwort trägt geprüfte Belege, und die
 * Notiz soll sie behalten, damit ein Chip darin dieselbe Stelle öffnet wie im
 * Gespräch. Der Aufrufer schickt deshalb eine Nachrichten-Id und nicht die
 * Belege: was gespeichert wird, ist das, was der Resolver beim Schreiben der
 * Antwort geprüft hat (ADR-0003). Ein Client, der seine eigenen Belege
 * mitschickte, könnte Chips ablegen, die nie jemand nachgerechnet hat.
 */
import type {
  CreateSourceFromText,
  LoadMessageSegments,
  NoteRow,
  NotebookAccess,
  NotesRepository,
} from '../interfaces/notes.repository.js';

export interface NotesServiceDeps {
  repository: NotesRepository;
  notebooks: NotebookAccess;
  loadMessageSegments: LoadMessageSegments;
  createSourceFromText: CreateSourceFromText;
}

function notFound(what: 'note' | 'message'): never {
  throw Object.assign(new Error(what === 'note' ? 'No such note.' : 'No such message.'), {
    statusCode: 404,
    errorCode: what === 'note' ? 'NOTE_NOT_FOUND' : 'MESSAGE_NOT_FOUND',
  });
}

export class NotesService {
  constructor(private readonly deps: NotesServiceDeps) {}

  async list(notebookId: string, sessionId: string): Promise<NoteRow[]> {
    await this.deps.notebooks.readable(notebookId, sessionId);
    return this.deps.repository.listByNotebook(notebookId);
  }

  /** Eine Notiz, die jemand selbst geschrieben hat. Markdown, keine Belege. */
  async create(
    notebookId: string,
    sessionId: string,
    input: { title: string; markdown: string }
  ): Promise<NoteRow> {
    const { id: target } = await this.deps.notebooks.writableOrCopy(notebookId, sessionId);

    return this.deps.repository.create({
      notebookId: target,
      title: input.title.trim(),
      markdown: input.markdown,
      segments: null,
      fromMessageId: null,
    });
  }

  /**
   * Eine Antwort als Notiz sichern.
   *
   * Die Nachricht muss in demselben Notizbuch liegen, in das geschrieben wird.
   * Im Demo-Notizbuch gibt es keine gespeicherten Turns (docs/KNOWN-LIMITS.md),
   * also gibt es dort auch nichts zu sichern - und weil die Prüfung vor dem
   * Lesen der Nachricht läuft, entsteht dabei auch keine leere Kopie.
   */
  async saveAnswer(
    notebookId: string,
    sessionId: string,
    input: { messageId: string; title: string }
  ): Promise<NoteRow> {
    const message = await this.deps.loadMessageSegments(notebookId, input.messageId);
    if (!message) notFound('message');

    const { id: target } = await this.deps.notebooks.writableOrCopy(notebookId, sessionId);

    return this.deps.repository.create({
      notebookId: target,
      title: input.title.trim(),
      // Der Klartext daneben, damit "Convert to source" und "Copy" etwas haben,
      // das ohne die Chips gelesen werden kann. Verbunden mit nichts: die
      // Segmente sind ein Fließtext, kein Absatz je Beleg (`answerText`).
      markdown: message.segments.map((segment) => segment.text).join(''),
      segments: message.segments,
      fromMessageId: input.messageId,
    });
  }

  /**
   * Eine Notiz zu einer Quelle machen.
   *
   * Über denselben Weg wie eingefügter Text: einmal normalisieren, gegen die
   * Token des Notizbuchs zählen, den Guide vom Worker schreiben lassen. Eine
   * Quelle ohne Guide ist genau der Fehler, den M8-T1 am Demo-Notizbuch
   * gefunden hat, und eine Notiz, die zur Quelle wird, soll sich von einer
   * eingefügten nicht unterscheiden - auch nicht darin, dass eine spätere
   * Antwort sie zitieren kann.
   */
  async convertToSource(
    notebookId: string,
    noteId: string,
    sessionId: string
  ): Promise<{ sourceId: string; notebookId: string }> {
    const { id: target } = await this.deps.notebooks.writableOrCopy(notebookId, sessionId);

    const note = await this.deps.repository.findById(target, noteId);
    if (!note) notFound('note');

    const source = await this.deps.createSourceFromText({
      notebookId: target,
      sessionId,
      title: note.title,
      text: note.markdown,
    });

    // Die Notiz bleibt. Sie ist das, was jemand aufgeschrieben hat; die Quelle
    // ist eine zweite Sache, die daraus entstanden ist, und ein Klick, der
    // beides in einem verschiebt, ist ein Klick, den man nicht zurücknehmen
    // kann.
    return { sourceId: source.id, notebookId: source.notebookId };
  }

  async remove(notebookId: string, noteId: string, sessionId: string): Promise<void> {
    const { id: target } = await this.deps.notebooks.writableOrCopy(notebookId, sessionId);

    const note = await this.deps.repository.findById(target, noteId);
    if (!note) notFound('note');

    await this.deps.repository.remove(target, noteId);
  }
}
