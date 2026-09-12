/**
 * Reports: the request that is idempotent and the job that always ends.
 *
 * Two claims from docs/PLAN.md M6-T1, and both are about money. Asking twice
 * must produce one report, because the second one would be a second request
 * over the whole notebook. And a model call that fails must leave a row that
 * says `failed` with a reason - not a row stuck on `running` that the interface
 * spins under and nobody ever clears.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';

import { runReportJob, type ReportDeps, type ReportSource } from '../internal/report.job.js';
import { reportKey } from '../internal/formats.js';
import { StudioService } from '../services/studio.service.js';
import type {
  ArtifactRow,
  ArtifactWithBody,
  CreateArtifactData,
  NotebookAccess,
  StudioRepository,
} from '../interfaces/studio.repository.js';

const NOTEBOOK = '00000000-0000-4000-8000-000000000001';

class InMemoryArtifacts implements StudioRepository {
  readonly rows: ArtifactWithBody[] = [];
  private next = 0;

  async createOrGet(data: CreateArtifactData) {
    const existing = this.rows.find(
      (row) => row.notebookId === data.notebookId && this.keyOf(row) === data.idempotencyKey
    );
    if (existing) return { artifact: existing, created: false };

    this.next += 1;
    const row: ArtifactWithBody = {
      id: `00000000-0000-4000-9000-${String(this.next).padStart(12, '0')}`,
      notebookId: data.notebookId,
      title: null,
      type: data.type,
      status: 'queued',
      params: data.params,
      error: null,
      createdAt: new Date('2026-09-12T10:00:00Z'),
      startedAt: null,
      finishedAt: null,
      segments: null,
      promptUsed: null,
    };
    this.rows.push(row);
    this.keys.set(row.id, data.idempotencyKey);
    return { artifact: row, created: true };
  }

  private readonly keys = new Map<string, string>();
  private keyOf(row: ArtifactRow): string {
    return this.keys.get(row.id) ?? '';
  }

  async listByNotebook(notebookId: string) {
    return this.rows.filter((row) => row.notebookId === notebookId);
  }

  async findById(notebookId: string, artifactId: string) {
    return this.rows.find((row) => row.id === artifactId && row.notebookId === notebookId) ?? null;
  }

  async requeue(artifactId: string) {
    const row = this.rows.find((one) => one.id === artifactId);
    if (!row) return;
    Object.assign(row, {
      status: 'queued',
      error: null,
      startedAt: null,
      finishedAt: null,
      segments: null,
      promptUsed: null,
    });
  }
}

const notebooks: NotebookAccess = {
  readable: async (notebookId) => ({ id: notebookId }),
  writable: async (notebookId, sessionId) => {
    if (sessionId !== 'session-a') {
      throw Object.assign(new Error('No such notebook.'), {
        statusCode: 404,
        errorCode: 'NOTEBOOK_NOT_FOUND',
      });
    }
    return { id: notebookId };
  },
};

let repository: InMemoryArtifacts;
let enqueued: Array<{ artifactId: string; notebookId: string }>;
let budgetSpent: boolean;

function serviceFor(): StudioService {
  return new StudioService({
    repository,
    notebooks,
    assertBudgetLeft: async () => {
      if (budgetSpent) {
        throw Object.assign(new Error('Tagesbudget erreicht'), {
          statusCode: 503,
          errorCode: 'BUDGET_SPENT',
        });
      }
    },
    enqueueReport: async (job) => {
      enqueued.push(job);
    },
  });
}

beforeEach(() => {
  repository = new InMemoryArtifacts();
  enqueued = [];
  budgetSpent = false;
});

describe('asking for a report', () => {
  it('gives the same report back when it is asked for twice', async () => {
    const service = serviceFor();

    const first = await service.request(NOTEBOOK, 'session-a', { format: 'briefing', focus: '' });
    const second = await service.request(NOTEBOOK, 'session-a', { format: 'briefing', focus: '' });

    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.created).toBe(false);
    // And only one job. The second enqueue would be a second request over the
    // whole notebook for a page that already exists.
    expect(enqueued).toHaveLength(1);
  });

  it('treats the same format with a different focus as a different report', async () => {
    const service = serviceFor();

    const plain = await service.request(NOTEBOOK, 'session-a', { format: 'briefing', focus: '' });
    const focused = await service.request(NOTEBOOK, 'session-a', {
      format: 'briefing',
      focus: 'Only the deadlines',
    });

    expect(focused.artifact.id).not.toBe(plain.artifact.id);
    expect(enqueued).toHaveLength(2);
  });

  it('does not buy a second run with trailing whitespace', () => {
    // The key is normalised, so " Only the deadlines " is the same request.
    expect(reportKey('briefing', ' Only  the deadlines ')).toBe(
      reportKey('briefing', 'Only the deadlines')
    );
  });

  it('refuses Create your own without a description', async () => {
    const service = serviceFor();

    await expect(
      service.request(NOTEBOOK, 'session-a', { format: 'custom', focus: '   ' })
    ).rejects.toMatchObject({ errorCode: 'FOCUS_REQUIRED' });

    expect(repository.rows).toHaveLength(0);
  });

  it('leaves no queued report behind when the budget is spent', async () => {
    budgetSpent = true;
    const service = serviceFor();

    await expect(
      service.request(NOTEBOOK, 'session-a', { format: 'faq', focus: '' })
    ).rejects.toMatchObject({ errorCode: 'BUDGET_SPENT' });

    expect(repository.rows).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });

  it('is a write, so another session does not get one', async () => {
    const service = serviceFor();

    await expect(
      service.request(NOTEBOOK, 'session-b', { format: 'faq', focus: '' })
    ).rejects.toMatchObject({ errorCode: 'NOTEBOOK_NOT_FOUND' });
  });

  it('reuses the row when a failed report is asked for again', async () => {
    const service = serviceFor();
    const { artifact } = await service.request(NOTEBOOK, 'session-a', {
      format: 'faq',
      focus: '',
    });
    repository.rows[0].status = 'failed';
    repository.rows[0].error = 'The model was busy. Try again in a moment.';

    const retried = await service.retry(NOTEBOOK, artifact.id, 'session-a');

    // One report, asked for twice. Three failed attempts of the same report in
    // a list is a list nobody can read.
    expect(repository.rows).toHaveLength(1);
    expect(retried.status).toBe('queued');
    expect(repository.rows[0].error).toBeNull();
    expect(enqueued).toHaveLength(2);
  });

  it('does not retry a report that did not fail', async () => {
    const service = serviceFor();
    const { artifact } = await service.request(NOTEBOOK, 'session-a', {
      format: 'faq',
      focus: '',
    });

    await expect(service.retry(NOTEBOOK, artifact.id, 'session-a')).rejects.toMatchObject({
      errorCode: 'REPORT_NOT_FAILED',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The job                                                                     */
/* -------------------------------------------------------------------------- */

const SOURCE: ReportSource = {
  id: 'src-1',
  position: 1,
  title: 'Verordnung',
  kind: 'pdf',
  text: 'Sie gilt ab dem 2. August 2026.',
  pageCount: 1,
};

function jobDeps(overrides: Partial<ReportDeps> = {}) {
  const written: unknown[] = [];
  const failed: string[] = [];
  const row = {
    id: 'a1',
    notebookId: NOTEBOOK,
    type: 'report',
    status: 'queued',
    params: { format: 'briefing' as const, focus: '' },
  };

  const deps: ReportDeps = {
    getArtifact: async () => row,
    readySources: async () => [SOURCE],
    start: async () => {
      row.status = 'running';
    },
    write: async () => ({
      segments: [{ text: 'Sie gilt ab 2026.', citations: [] }],
      promptUsed: 'the rendered prompt',
      droppedCitations: 0,
    }),
    finish: async (_id, report) => {
      row.status = 'ready';
      written.push(report);
    },
    fail: async (_id, reason) => {
      row.status = 'failed';
      failed.push(reason);
    },
    onError: () => undefined,
    ...overrides,
  };

  return { deps, written, failed, row };
}

describe('writing a report', () => {
  it('stores the report and its prompt, and ends ready', async () => {
    const { deps, written, row } = jobDeps();

    const result = await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(result).toMatchObject({ status: 'written' });
    expect(row.status).toBe('ready');
    expect(written[0]).toMatchObject({ title: 'Briefing Doc', promptUsed: 'the rendered prompt' });
  });

  it('ends as failed with a reason when the model call throws', async () => {
    const { deps, failed, row } = jobDeps({
      write: async () => {
        throw Object.assign(new Error('overloaded_error'), { status: 529 });
      },
    });

    const result = await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(result.status).toBe('failed');
    // Terminal, always. A row left on `running` is a panel that spins for ever.
    expect(row.status).toBe('failed');
    expect(failed[0]).toBe('The model was busy. Try again in a moment.');
  });

  it('never writes the upstream message to the row', async () => {
    // An upstream error can carry the request, and the request carries the
    // documents. `source.error` learned this in M2; this is the same rule.
    const { deps, failed } = jobDeps({
      write: async () => {
        throw Object.assign(new Error('invalid_request: messages.0.content[3].text "Sie gilt ab"'), {
          status: 400,
        });
      },
    });

    await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(failed[0]).not.toContain('Sie gilt ab');
    expect(failed[0]).toBe('The report could not be requested.');
  });

  it('writes nothing when the job runs a second time after a crash', async () => {
    const { deps, written, row } = jobDeps();
    const ready: ReportDeps = { ...deps, getArtifact: async () => ({ ...row, status: 'ready' }) };

    const result = await runReportJob(ready, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(result).toEqual({ status: 'skipped', reason: 'already written' });
    expect(written).toHaveLength(0);
  });

  it('says so rather than writing a page about nothing', async () => {
    const { deps, failed, row } = jobDeps({ readySources: async () => [] });

    const result = await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(result.status).toBe('failed');
    expect(row.status).toBe('failed');
    expect(failed[0]).toBe('This notebook has no readable sources yet.');
  });

  it('does nothing for an artifact that is gone', async () => {
    const { deps, written, failed } = jobDeps({ getArtifact: async () => null });

    const result = await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(result).toEqual({ status: 'skipped', reason: 'artifact no longer exists' });
    expect(written).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });
});
