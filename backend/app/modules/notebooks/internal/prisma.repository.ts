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

export class PrismaNotebooksRepository implements NotebooksRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateNotebookData): Promise<NotebookRow> {
    return this.prisma.notebook.create({
      data: { sessionId: data.sessionId, title: data.title },
    });
  }

  async findById(id: string): Promise<NotebookRow | null> {
    return this.prisma.notebook.findUnique({ where: { id } });
  }

  async listBySession(sessionId: string): Promise<NotebookRow[]> {
    return this.prisma.notebook.findMany({
      where: { sessionId },
      orderBy: { lastUsedAt: 'desc' },
    });
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
