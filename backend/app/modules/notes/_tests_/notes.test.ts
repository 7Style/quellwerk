/**
 * Notizen: die vier Dinge aus docs/SPEC.md, und die eine Regel, die dahinter
 * steht.
 *
 * Die Regel: eine Notiz zeichnet Belege wie eine Antwort, also darf sie nur
 * Belege enthalten, die der Server geprüft hat. Deshalb schickt der Client eine
 * Nachrichten-Id, und deshalb prüft der Test unten, dass die Segmente aus der
 * gespeicherten Nachricht kommen und nicht aus der Anfrage.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';

import { NotesService } from '../services/notes.service.js';
import type {
  CreateNoteData,
  NoteRow,
  NoteSegment,
  NotebookAccess,
  NotesRepository,
} from '../interfaces/notes.repository.js';

const NOTEBOOK = '00000000-0000-4000-8000-000000000001';
const DEMO = 'demo';
const MESSAGE = '00000000-0000-4000-8000-0000000000a1';

const SEGMENTS: NoteSegment[] = [
  {
    text: 'Ein Risikomanagementsystem ist einzurichten',
    citations: [
      {
        sourceId: '00000000-0000-4000-8000-0000000000s1'.slice(0, 36),
        sourceTitle: 'Verordnung',
        start: 37,
        end: 131,
        text: 'Sie gilt ab dem 2. August 2026.',
        page: 20,
      },
    ],
  },
  { text: ', und die Dokumentation entsteht davor.', citations: [] },
];

class InMemoryNotes implements NotesRepository {
  readonly rows: NoteRow[] = [];
  private next = 0;

  async create(data: CreateNoteData): Promise<NoteRow> {
    this.next += 1;
    const row: NoteRow = {
      id: `note-${this.next}`,
      notebookId: data.notebookId,
      title: data.title,
      markdown: data.markdown,
      segments: data.segments ?? null,
      fromMessageId: data.fromMessageId ?? null,
      createdAt: new Date('2026-09-13T08:00:00Z'),
    };
    this.rows.push(row);
    return row;
  }

  async listByNotebook(notebookId: string): Promise<NoteRow[]> {
    return this.rows.filter((row) => row.notebookId === notebookId);
  }

  async findById(notebookId: string, noteId: string): Promise<NoteRow | null> {
    return this.rows.find((row) => row.id === noteId && row.notebookId === notebookId) ?? null;
  }

  async remove(notebookId: string, noteId: string): Promise<void> {
    const at = this.rows.findIndex((row) => row.id === noteId && row.notebookId === notebookId);
    if (at >= 0) this.rows.splice(at, 1);
  }
}

function notFound(): never {
  throw Object.assign(new Error('No such notebook.'), {
    statusCode: 404,
    errorCode: 'NOTEBOOK_NOT_FOUND',
  });
}

const notebooks: NotebookAccess = {
  readable: async (notebookId, sessionId) =>
    sessionId === 'session-a' || notebookId === DEMO ? { id: notebookId } : notFound(),
  writableOrCopy: async (notebookId, sessionId) => {
    if (notebookId === DEMO) return { id: `copy-of-demo-for-${sessionId}` };
    return sessionId === 'session-a' ? { id: notebookId } : notFound();
  },
};

let repository: InMemoryNotes;
let created: Array<{ notebookId: string; title: string; text: string }>;

function serviceFor(overrides: Partial<ConstructorParameters<typeof NotesService>[0]> = {}) {
  return new NotesService({
    repository,
    notebooks,
    loadMessageSegments: async (notebookId, messageId) =>
      notebookId === NOTEBOOK && messageId === MESSAGE ? { segments: SEGMENTS } : null,
    createSourceFromText: async ({ notebookId, title, text }) => {
      created.push({ notebookId, title, text });
      return { id: `src-${created.length}`, notebookId };
    },
    ...overrides,
  });
}

beforeEach(() => {
  repository = new InMemoryNotes();
  created = [];
});

describe('a note somebody writes', () => {
  it('is stored with its text and without citations', async () => {
    const note = await serviceFor().create(NOTEBOOK, 'session-a', {
      title: '  Meine Notiz  ',
      markdown: 'Artikel 9 verlangt ein Risikomanagementsystem.',
    });

    expect(note.title).toBe('Meine Notiz');
    expect(note.markdown).toBe('Artikel 9 verlangt ein Risikomanagementsystem.');
    // Keine Chips: es hat nie ein Resolver etwas daran geprüft.
    expect(note.segments).toBeNull();
    expect(note.fromMessageId).toBeNull();
  });

  it('is not written into a notebook of another session', async () => {
    await expect(
      serviceFor().create(NOTEBOOK, 'session-b', { title: 'Fremd', markdown: 'Text' })
    ).rejects.toMatchObject({ errorCode: 'NOTEBOOK_NOT_FOUND' });
  });

  it('lands in the copy when it is written in the demo notebook', async () => {
    // Copy-on-first-write (M7-T1): eine Notiz ist ein Schreibzugriff.
    const note = await serviceFor().create(DEMO, 'visitor', { title: 'Meine', markdown: 'Text' });

    expect(note.notebookId).toBe('copy-of-demo-for-visitor');
  });
});

describe('saving an answer as a note', () => {
  it('keeps the segments the server verified, so the chips still work', async () => {
    const note = await serviceFor().saveAnswer(NOTEBOOK, 'session-a', {
      messageId: MESSAGE,
      title: 'Pflichten',
    });

    expect(note.segments).toEqual(SEGMENTS);
    expect(note.fromMessageId).toBe(MESSAGE);
    expect(note.segments?.[0].citations[0].page).toBe(20);
  });

  it('writes the answer beside them as plain text, joined with nothing', async () => {
    // Dieselbe Regel wie `answerText`: die Segmente sind ein Fließtext, kein
    // Absatz je Beleg. Mit Leerzeilen verbunden zerreißt jeder Satz an jedem
    // Chip - der Fehler, der M3 gekostet hat.
    const note = await serviceFor().saveAnswer(NOTEBOOK, 'session-a', {
      messageId: MESSAGE,
      title: 'Pflichten',
    });

    expect(note.markdown).toBe(
      'Ein Risikomanagementsystem ist einzurichten, und die Dokumentation entsteht davor.'
    );
  });

  it('refuses a message that is not in this notebook', async () => {
    await expect(
      serviceFor().saveAnswer(NOTEBOOK, 'session-a', {
        messageId: '00000000-0000-4000-8000-0000000000ff',
        title: 'Fremd',
      })
    ).rejects.toMatchObject({ errorCode: 'MESSAGE_NOT_FOUND' });

    expect(repository.rows).toHaveLength(0);
  });

  it('leaves no copy of the demo notebook behind when there is nothing to save', async () => {
    // Im Demo-Notizbuch wird kein Turn gespeichert (docs/KNOWN-LIMITS.md), also
    // gibt es dort nichts zu sichern - und weil die Nachricht vor der
    // Notizbuchprüfung gelesen wird, entsteht dabei auch keine leere Kopie.
    const copies: string[] = [];
    const service = serviceFor({
      notebooks: {
        ...notebooks,
        writableOrCopy: async (notebookId, sessionId) => {
          copies.push(notebookId);
          return { id: `copy-of-${notebookId}-for-${sessionId}` };
        },
      },
    });

    await expect(
      service.saveAnswer(DEMO, 'visitor', { messageId: MESSAGE, title: 'Antwort' })
    ).rejects.toMatchObject({ errorCode: 'MESSAGE_NOT_FOUND' });

    expect(copies).toHaveLength(0);
  });
});

describe('converting a note into a source', () => {
  it('goes through the same path as pasted text', async () => {
    const service = serviceFor();
    const note = await service.create(NOTEBOOK, 'session-a', {
      title: 'Meine Notiz',
      markdown: 'Artikel 9 verlangt ein Risikomanagementsystem.',
    });

    const source = await service.convertToSource(NOTEBOOK, note.id, 'session-a');

    expect(created).toEqual([
      {
        notebookId: NOTEBOOK,
        title: 'Meine Notiz',
        text: 'Artikel 9 verlangt ein Risikomanagementsystem.',
      },
    ]);
    expect(source.sourceId).toBe('src-1');
  });

  it('keeps the note, because a click that moves both cannot be taken back', async () => {
    const service = serviceFor();
    const note = await service.create(NOTEBOOK, 'session-a', { title: 'Bleibt', markdown: 'Text' });

    await service.convertToSource(NOTEBOOK, note.id, 'session-a');

    expect(await service.list(NOTEBOOK, 'session-a')).toHaveLength(1);
  });

  it('refuses a note that is not in this notebook', async () => {
    await expect(
      serviceFor().convertToSource(NOTEBOOK, 'note-does-not-exist', 'session-a')
    ).rejects.toMatchObject({ errorCode: 'NOTE_NOT_FOUND' });

    expect(created).toHaveLength(0);
  });
});

describe('deleting a note', () => {
  it('removes the row', async () => {
    const service = serviceFor();
    const note = await service.create(NOTEBOOK, 'session-a', { title: 'Weg', markdown: 'Text' });

    await service.remove(NOTEBOOK, note.id, 'session-a');

    expect(await service.list(NOTEBOOK, 'session-a')).toHaveLength(0);
  });

  it('does not delete a note of another session', async () => {
    const service = serviceFor();
    const note = await service.create(NOTEBOOK, 'session-a', { title: 'Meins', markdown: 'Text' });

    await expect(service.remove(NOTEBOOK, note.id, 'session-b')).rejects.toMatchObject({
      errorCode: 'NOTEBOOK_NOT_FOUND',
    });
    expect(repository.rows).toHaveLength(1);
  });

  it('leaves a source that was made from it', async () => {
    const service = serviceFor();
    const note = await service.create(NOTEBOOK, 'session-a', { title: 'Quelle', markdown: 'Text' });
    await service.convertToSource(NOTEBOOK, note.id, 'session-a');

    await service.remove(NOTEBOOK, note.id, 'session-a');

    // Die Quelle ist eine eigene Zeile in einem anderen Modul; sie wird von
    // hier aus nicht angefasst, weder beim Loeschen noch sonst.
    expect(created).toHaveLength(1);
  });
});
