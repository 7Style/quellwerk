/**
 * The studio repository on Prisma.
 *
 * The only file in the module that knows about the database. Everything above
 * it works against the interface, which is what lets the service and the job be
 * tested without one.
 */
import { Prisma, type PrismaClient } from '../../../lib/prisma.js';
import type {
  ArtifactRow,
  ArtifactWithBody,
  CreateArtifactData,
  StudioRepository,
} from '../interfaces/studio.repository.js';
import type { ReportFormat } from './formats.js';

const ROW_FIELDS = {
  id: true,
  notebookId: true,
  title: true,
  type: true,
  status: true,
  params: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

/** The Json column holds what was written into it; narrow it once, here. */
function asParams(value: unknown): { format: ReportFormat; focus: string } | null {
  if (!value || typeof value !== 'object') return null;
  const params = value as { format?: unknown; focus?: unknown };
  if (typeof params.format !== 'string') return null;
  return {
    format: params.format as ReportFormat,
    focus: typeof params.focus === 'string' ? params.focus : '',
  };
}

function toRow(row: Omit<ArtifactRow, 'params'> & { params: unknown }): ArtifactRow {
  return { ...row, params: asParams(row.params) };
}

export class PrismaStudioRepository implements StudioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createOrGet(data: CreateArtifactData) {
    try {
      const created = await this.prisma.artifact.create({
        data: {
          notebookId: data.notebookId,
          type: data.type,
          idempotencyKey: data.idempotencyKey,
          params: data.params,
          status: 'queued',
        },
        select: ROW_FIELDS,
      });
      return { artifact: toRow(created), created: true };
    } catch (error) {
      // P2002 is the unique index on (notebookId, idempotencyKey) doing its
      // job: somebody asked for the same report twice. Catching it rather than
      // reading first is what makes two clicks in the same millisecond one
      // report instead of two 150,000 token requests.
      if ((error as { code?: string }).code !== 'P2002') throw error;

      const existing = await this.prisma.artifact.findFirst({
        where: { notebookId: data.notebookId, idempotencyKey: data.idempotencyKey },
        select: ROW_FIELDS,
      });
      if (!existing) throw error;
      return { artifact: toRow(existing), created: false };
    }
  }

  async listByNotebook(notebookId: string): Promise<ArtifactRow[]> {
    const rows = await this.prisma.artifact.findMany({
      // Reports only. The table also takes the audio overview in M10, and an
      // audio row read as a report would come back as a Briefing Doc.
      where: { notebookId, type: 'report' },
      orderBy: { createdAt: 'desc' },
      select: ROW_FIELDS,
    });
    return rows.map(toRow);
  }

  async findById(notebookId: string, artifactId: string): Promise<ArtifactWithBody | null> {
    // Both ids in the WHERE clause: a report id from another notebook has to
    // miss rather than resolve and then be checked.
    const row = await this.prisma.artifact.findFirst({
      where: { id: artifactId, notebookId, type: 'report' },
      select: { ...ROW_FIELDS, segments: true, promptUsed: true },
    });
    return row ? { ...toRow(row), segments: row.segments, promptUsed: row.promptUsed } : null;
  }

  async requeue(artifactId: string): Promise<void> {
    await this.prisma.artifact.update({
      where: { id: artifactId },
      // Everything the failed run left behind goes with it. A retry that kept
      // the old error would show it next to a report that is being written.
      data: {
        status: 'queued',
        error: null,
        startedAt: null,
        finishedAt: null,
        heartbeatAt: null,
        segments: Prisma.DbNull,
        promptUsed: null,
      },
    });
  }
}
