/**
 * Die Notizen-Ablage auf Prisma.
 *
 * Die einzige Datei des Moduls, die die Datenbank kennt. Alles darüber arbeitet
 * gegen die Schnittstelle, und genau das lässt den Dienst ohne Datenbank testen.
 */
import { Prisma, type PrismaClient } from '../../../lib/prisma.js';
import type {
  CreateNoteData,
  NoteRow,
  NoteSegment,
  NotesRepository,
} from '../interfaces/notes.repository.js';

/**
 * Die Json-Spalte hält, was hineingeschrieben wurde; einmal verengen, hier.
 *
 * Eine halb geschriebene oder ältere Form darf nicht als Beleg in der
 * Oberfläche landen: was nicht wie ein Segment aussieht, ist keins.
 */
function asSegments(value: unknown): NoteSegment[] | null {
  if (!Array.isArray(value)) return null;

  const segments = value.filter(
    (one): one is NoteSegment =>
      typeof one === 'object' &&
      one !== null &&
      typeof (one as NoteSegment).text === 'string' &&
      Array.isArray((one as NoteSegment).citations)
  );

  return segments.length > 0 ? segments : null;
}

function toRow(row: {
  id: string;
  notebookId: string;
  title: string;
  markdown: string;
  segments: unknown;
  fromMessageId: string | null;
  createdAt: Date;
}): NoteRow {
  return { ...row, segments: asSegments(row.segments) };
}

export class PrismaNotesRepository implements NotesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateNoteData): Promise<NoteRow> {
    const row = await this.prisma.note.create({
      data: {
        notebookId: data.notebookId,
        title: data.title,
        markdown: data.markdown,
        segments: (data.segments ?? undefined) as unknown as Prisma.InputJsonValue,
        fromMessageId: data.fromMessageId ?? null,
      },
    });
    return toRow(row);
  }

  async listByNotebook(notebookId: string): Promise<NoteRow[]> {
    const rows = await this.prisma.note.findMany({
      where: { notebookId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async findById(notebookId: string, noteId: string): Promise<NoteRow | null> {
    // Beide Ids in der Abfrage: die Id einer fremden Notiz soll nicht treffen
    // und danach geprüft werden, sondern gar nicht treffen.
    const row = await this.prisma.note.findFirst({ where: { id: noteId, notebookId } });
    return row ? toRow(row) : null;
  }

  async remove(notebookId: string, noteId: string): Promise<void> {
    await this.prisma.note.deleteMany({ where: { id: noteId, notebookId } });
  }
}
