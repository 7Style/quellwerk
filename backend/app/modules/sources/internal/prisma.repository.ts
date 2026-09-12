/**
 * The Prisma-backed repository. The only file in this module that knows what
 * the table looks like.
 */
import type { PrismaClient } from '../../../lib/prisma.js';
import type {
  CreateSourceData,
  SourceRow,
  SourcesRepository,
} from '../interfaces/sources.repository.js';

/** Columns the module reads. Source.text is not among them; it is fetched by id. */
const ROW_FIELDS = {
  id: true,
  notebookId: true,
  position: true,
  title: true,
  kind: true,
  status: true,
  step: true,
  error: true,
  charCount: true,
  tokenCount: true,
  createdAt: true,
} as const;

export class PrismaSourcesRepository implements SourcesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async countByNotebook(notebookId: string): Promise<number> {
    return this.prisma.source.count({ where: { notebookId } });
  }

  async findWithText(notebookId: string, sourceId: string) {
    // Both ids in the WHERE clause. A source id from another notebook has to
    // miss, and missing is what a 404 is made of.
    return this.prisma.source.findFirst({
      where: { id: sourceId, notebookId },
      select: {
        id: true,
        notebookId: true,
        position: true,
        title: true,
        kind: true,
        status: true,
        step: true,
        error: true,
        charCount: true,
        tokenCount: true,
        createdAt: true,
        text: true,
      },
    });
  }

  async maxPosition(notebookId: string): Promise<number> {
    const highest = await this.prisma.source.findFirst({
      where: { notebookId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return highest?.position ?? 0;
  }

  async create(data: CreateSourceData): Promise<SourceRow> {
    return this.prisma.source.create({
      data: {
        notebookId: data.notebookId,
        position: data.position,
        title: data.title,
        kind: data.kind,
        text: data.text,
        charCount: data.charCount,
        tokenCount: data.tokenCount,
        originalName: data.originalName ?? null,
        mime: data.mime ?? null,
        storagePath: data.storagePath ?? null,
        status: data.status,
      },
      select: ROW_FIELDS,
    });
  }

  async listByNotebook(notebookId: string): Promise<SourceRow[]> {
    return this.prisma.source.findMany({
      where: { notebookId },
      orderBy: { position: 'asc' },
      select: ROW_FIELDS,
    });
  }

  async addNotebookTokens(notebookId: string, tokens: number): Promise<void> {
    // An increment and not a read-modify-write: two sources added at the same
    // moment would otherwise both read the old total and the second would
    // overwrite the first.
    await this.prisma.notebook.update({
      where: { id: notebookId },
      data: { tokenCount: { increment: tokens } },
    });
  }
}
