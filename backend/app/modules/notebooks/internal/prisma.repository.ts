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

  async listBySession(sessionId: string): Promise<NotebookRow[]> {
    const rows = await this.prisma.notebook.findMany({
      where: { sessionId },
      orderBy: { lastUsedAt: 'desc' },
      include: WITH_SOURCE_COUNT,
    });
    return rows.map(withCount);
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
