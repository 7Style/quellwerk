/**
 * The Prisma-backed repository. The only file in this module that knows what
 * the table looks like.
 */
import type { PrismaClient } from '../../../lib/prisma.js';
import type {
  CreateNotebookData,
  NotebookRow,
  NotebooksRepository,
} from '../interfaces/notebooks.repository.js';

/** Counted in the same query; see NotebookRow.sourceCount for why not a column. */
const WITH_SOURCE_COUNT = { _count: { select: { sources: true } } } as const;

function withCount<T extends { _count: { sources: number } }>(row: T): Omit<T, '_count'> & {
  sourceCount: number;
} {
  const { _count, ...rest } = row;
  return { ...rest, sourceCount: _count.sources };
}

export class PrismaNotebooksRepository implements NotebooksRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateNotebookData): Promise<NotebookRow> {
    const row = await this.prisma.notebook.create({
      data: { sessionId: data.sessionId, title: data.title },
      include: WITH_SOURCE_COUNT,
    });
    return withCount(row);
  }

  async findById(id: string): Promise<NotebookRow | null> {
    const row = await this.prisma.notebook.findUnique({
      where: { id },
      include: WITH_SOURCE_COUNT,
    });
    return row ? withCount(row) : null;
  }

  /**
   * This session's notebooks, and the demo notebook after them.
   *
   * The demo is in the list because the home page is the first thing a visitor
   * sees and an empty grid is a product that looks broken: the notebook exists,
   * it is readable by everyone (SECURITY.md 7.2), and it was only reachable by
   * typing `/n/demo`. It belongs to no session, so `sessionId` alone can never
   * match it.
   *
   * Own notebooks first: `isDemo` sorts false before true, and a visitor with
   * work of their own should not have to scroll past the demo to find it. The
   * demo is touched by every visitor who opens it, so ordering the whole list
   * by `lastUsedAt` would let it float to the top of everybody's grid.
   */
  async listBySession(sessionId: string): Promise<NotebookRow[]> {
    const rows = await this.prisma.notebook.findMany({
      where: { OR: [{ sessionId }, { isDemo: true }] },
      orderBy: [{ isDemo: 'asc' }, { lastUsedAt: 'desc' }],
      include: WITH_SOURCE_COUNT,
    });
    return rows.map(withCount);
  }

  /**
   * Das Demo-Notizbuch in eine Sitzung kopieren, einmal je Sitzung.
   *
   * In einer Transaktion, weil ein Notizbuch ohne seine Quellen kein Notizbuch
   * ist: bricht das Kopieren der Quellen ab, soll auch die Notizbuchzeile nicht
   * stehen bleiben.
   *
   * Kopiert werden Notizbuch und Quellen, nicht Nachrichten und nicht Reports.
   * Im Demo-Notizbuch gibt es beides nicht (der Seed löscht es, und Turns
   * werden dort nicht gespeichert); und ein Report, den jemand anderes bestellt
   * hat, gehört nicht in die eigene Arbeitsfläche.
   *
   * `status` und `tokenCount` kommen mit: die Quellen sind schon eingelesen,
   * schon gemessen und schon mit einem Guide versehen. Eine Kopie, die von vorn
   * einliest, würde vier Modellaufrufe kosten und dasselbe Ergebnis schreiben.
   *
   * Diese Methode liest die Quellen-Tabelle, obwohl sie im Notizbuch-Modul
   * liegt. Das ist dieselbe Grenze, die `_count.sources` schon überschreitet:
   * die Quellen eines Notizbuchs sind Teil dieses Aggregats, solange es um
   * Kopieren und Löschen geht. Was in ihnen steht, interessiert hier nicht.
   */
  async copyForSession(sourceId: string, sessionId: string): Promise<NotebookRow> {
    const existing = await this.prisma.notebook.findFirst({
      where: { clonedFrom: sourceId, sessionId },
      include: WITH_SOURCE_COUNT,
    });
    if (existing) return withCount(existing);

    const original = await this.prisma.notebook.findUniqueOrThrow({
      where: { id: sourceId },
      include: { sources: true },
    });

    const copy = await this.prisma.$transaction(async (tx) => {
      const notebook = await tx.notebook.create({
        data: {
          sessionId,
          clonedFrom: original.id,
          title: original.title,
          emoji: original.emoji,
          userSetTitle: original.userSetTitle,
          summary: original.summary,
          themes: original.themes ?? undefined,
          suggestedQuestions: original.suggestedQuestions ?? undefined,
          tokenCount: original.tokenCount,
          tokenModel: original.tokenModel,
          // Die Kopie ist keine Demo mehr. Genau das ist der Punkt: sie gehört
          // einer Sitzung, ist beschreibbar und taucht in keiner fremden Liste
          // auf.
          isDemo: false,
          overviewRequestedAt: original.overviewRequestedAt,
        },
      });

      if (original.sources.length > 0) {
        await tx.source.createMany({
          data: original.sources.map((row) => ({
            notebookId: notebook.id,
            position: row.position,
            title: row.title,
            kind: row.kind,
            url: row.url,
            originalName: row.originalName,
            mime: row.mime,
            text: row.text,
            charCount: row.charCount,
            tokenCount: row.tokenCount,
            pages: row.pages ?? undefined,
            guide: row.guide ?? undefined,
            warnings: row.warnings ?? undefined,
            status: row.status,
            // Ohne Datei: die Originaldatei ist beim Einlesen gelöscht worden,
            // der Text ist die Quelle (ADR-0003). Ein Pfad, der auf nichts
            // zeigt, wäre schlimmer als keiner.
            storagePath: null,
          })),
        });
      }

      return notebook.id;
    });

    const row = await this.prisma.notebook.findUniqueOrThrow({
      where: { id: copy },
      include: WITH_SOURCE_COUNT,
    });
    return withCount(row);
  }

  async touch(id: string): Promise<void> {
    // updateMany and not update: a notebook deleted between the read and this
    // write is not an error worth failing a request over, and updateMany on a
    // missing row is a no-op instead of a throw.
    await this.prisma.notebook.updateMany({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }
}
