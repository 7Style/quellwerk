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
import { dedupeKey, enqueue, enqueueReplacing } from '../../../services/queue/index.js';
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
/** Das Notizbuch, das keiner Sitzung gehört und beim Schreiben kopiert wird. */
const DEMO = 'demo';

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

function notFound(): never {
  throw Object.assign(new Error('No such notebook.'), {
    statusCode: 404,
    errorCode: 'NOTEBOOK_NOT_FOUND',
  });
}

/**
 * Only `session-a` owns this notebook, for reading as well as for writing.
 *
 * The demo notebook is the one case where `readable` says yes to everyone, and
 * it is the notebooks module that decides that. Here both answers are scoped,
 * so a test that forgets to pass the session cannot pass by accident.
 */
const notebooks: NotebookAccess = {
  readable: async (notebookId, sessionId) =>
    sessionId === 'session-a' ? { id: notebookId } : notFound(),
  writable: async (notebookId, sessionId) =>
    sessionId === 'session-a' ? { id: notebookId } : notFound(),
  // Wie im echten Modul: das Demo-Notizbuch wird beim Schreiben kopiert, und
  // der Aufrufer bekommt die Kopie zurück. `DEMO` ist hier die eine Id, die
  // jeder Sitzung gehört, sobald sie hineinschreibt.
  writableOrCopy: async (notebookId, sessionId) => {
    if (notebookId === DEMO) return { id: `copy-of-demo-for-${sessionId}` };
    return sessionId === 'session-a' ? { id: notebookId } : notFound();
  },
};

let repository: InMemoryArtifacts;
let enqueued: Array<{ artifactId: string; notebookId: string; replace?: boolean }>;
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

  it('does not list another session\'s reports', async () => {
    const service = serviceFor();
    await service.request(NOTEBOOK, 'session-a', { format: 'faq', focus: '' });

    await expect(service.list(NOTEBOOK, 'session-b')).rejects.toMatchObject({
      errorCode: 'NOTEBOOK_NOT_FOUND',
    });
  });

  it('does not hand a report to another session, even with its id', async () => {
    // 404 and not 403: a 403 would confirm the id exists (SECURITY.md 7.2).
    const service = serviceFor();
    const { artifact } = await service.request(NOTEBOOK, 'session-a', {
      format: 'faq',
      focus: '',
    });

    await expect(service.get(NOTEBOOK, artifact.id, 'session-b')).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'NOTEBOOK_NOT_FOUND',
    });
  });

  it('puts a report asked for in the demo notebook into the copy', async () => {
    // Copy-on-first-write (M7-T1): das Demo-Notizbuch gehoert keiner Sitzung,
    // ein Report darin waere ein Report in fremder Arbeit.
    const service = serviceFor();

    const { artifact } = await service.request(DEMO, 'visitor', {
      format: 'briefing',
      focus: '',
    });

    expect(artifact.notebookId).toBe('copy-of-demo-for-visitor');
    expect(enqueued[0].notebookId).toBe('copy-of-demo-for-visitor');
  });

  it('does not copy the demo notebook to retry a report it cannot hold', async () => {
    const service = serviceFor();

    await expect(service.retry(DEMO, 'any-artifact', 'visitor')).rejects.toMatchObject({
      errorCode: 'NOTEBOOK_NOT_FOUND',
    });
    expect(repository.rows).toHaveLength(0);
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
    // And it must say so: the failed job still holds the id, so a plain add is
    // dropped and the row would sit on `queued` for ever.
    expect(enqueued[1].replace).toBe(true);
    expect(enqueued[0].replace).toBeUndefined();
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
    assertBudget: async () => undefined,
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

  it('stops at the budget it is about to spend, not the one it was queued with', async () => {
    // Twenty reports asked for in one second all pass the route's check and
    // then run one after another. This is the check that sees what the ones
    // before it spent.
    const written: unknown[] = [];
    const { deps, failed, row } = jobDeps({
      assertBudget: async () => {
        throw Object.assign(new Error('Tagesbudget erreicht'), {
          statusCode: 503,
          errorCode: 'BUDGET_SPENT',
        });
      },
      write: async () => {
        written.push('called');
        throw new Error('the model must not be called');
      },
    });

    const result = await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(written).toHaveLength(0);
    expect(result.status).toBe('failed');
    expect(row.status).toBe('failed');
    expect(failed[0]).toBe('The daily budget for this demo is spent. Try again tomorrow.');
  });

  it('does nothing for an artifact that is gone', async () => {
    const { deps, written, failed } = jobDeps({ getArtifact: async () => null });

    const result = await runReportJob(deps, { artifactId: 'a1', notebookId: NOTEBOOK });

    expect(result).toEqual({ status: 'skipped', reason: 'artifact no longer exists' });
    expect(written).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The enqueue behind "Try again"                                              */
/* -------------------------------------------------------------------------- */

/**
 * A queue with the states BullMQ reports, and its rule about job ids.
 *
 * The rule is the point: an add whose id already exists is dropped in silence.
 * A report job that fails is caught inside the processor and returns, so BullMQ
 * files it as completed and `removeOnComplete: {count: 50}` keeps it under its
 * id - which is why "Try again" needs to remove it first. Measured against the
 * real Redis before it was written down here.
 */
class FakeQueue {
  readonly jobs = new Map<string, { data: unknown; state: string }>();
  readonly adds: string[] = [];
  readonly removes: string[] = [];

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    return {
      getState: async () => job.state,
      remove: async () => {
        this.removes.push(jobId);
        this.jobs.delete(jobId);
      },
    };
  }

  async add(_name: string, data: unknown, options: { jobId: string }) {
    if (this.jobs.has(options.jobId)) return;
    this.adds.push(options.jobId);
    this.jobs.set(options.jobId, { data, state: 'waiting' });
  }

  /** What BullMQ would have done to the job while nobody was looking. */
  moveTo(jobId: string, state: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`no job ${jobId}`);
    job.state = state;
  }
}

describe('asking again for a report that failed', () => {
  const jobId = dedupeKey(NOTEBOOK, 'report', 'a1');
  let queue: FakeQueue;

  beforeEach(() => {
    queue = new FakeQueue();
  });

  it('runs, although the finished job still holds the id', async () => {
    await enqueue('artifact', jobId, { kind: 'report' }, queue as never);
    queue.moveTo(jobId, 'completed');

    await enqueueReplacing('artifact', jobId, { kind: 'report' }, queue as never);

    expect(queue.removes).toEqual([jobId]);
    expect(queue.adds).toHaveLength(2);
  });

  it('does not queue a second run of work that is already running', async () => {
    await enqueue('artifact', jobId, { kind: 'report' }, queue as never);
    queue.moveTo(jobId, 'active');

    await enqueueReplacing('artifact', jobId, { kind: 'report' }, queue as never);

    // Removing it would not stop it, and a second job behind it would be a
    // second call over the whole notebook for the report being written.
    expect(queue.removes).toHaveLength(0);
    expect(queue.adds).toHaveLength(1);
  });

  it('is the plain add that a first ask uses, and that one dedupes', async () => {
    await enqueue('artifact', jobId, { kind: 'report' }, queue as never);
    queue.moveTo(jobId, 'completed');

    await enqueue('artifact', jobId, { kind: 'report' }, queue as never);

    expect(queue.adds).toHaveLength(1);
  });
});
