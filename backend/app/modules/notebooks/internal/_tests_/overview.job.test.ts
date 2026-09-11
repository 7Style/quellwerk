/**
 * The overview job and the debounce in front of it.
 *
 * Two separate things, tested separately: whether the job does the right thing
 * when it runs, and whether three sources added together make it run once. The
 * second is a property of the queue helper, which is given a fake queue here so
 * no Redis is involved.
 */
import { describe, expect, it, beforeEach, jest } from '@jest/globals';

import { enqueueDebounced, dedupeKey } from '../../../../services/queue/index.js';
import {
  runOverviewJob,
  SUGGESTED_QUESTION_COUNT,
  type NotebookOverview,
  type OverviewDeps,
  type OverviewSource,
} from '../overview.job.js';

const OVERVIEW: NotebookOverview = {
  summary: 'Vier Quellen zur KI-Verordnung.',
  themes: ['Risikoklassen', 'Fristen', 'Pflichten'],
  suggestedQuestions: ['Ab wann?', 'Für wen?', 'Was ist verboten?', 'Was kostet ein Verstoß?'],
};

function sources(count: number): OverviewSource[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `src-${index}`,
    position: index + 1,
    title: `Quelle ${index}`,
    kind: 'md',
    text: `Text ${index}`,
  }));
}

function deps(overrides: Partial<OverviewDeps> = {}): OverviewDeps & { saved: NotebookOverview[] } {
  const saved: NotebookOverview[] = [];
  return {
    saved,
    readySources: async () => sources(4),
    writeOverview: async () => OVERVIEW,
    saveOverview: async (_id, overview) => {
      saved.push(overview);
    },
    ...overrides,
  };
}

describe('the overview job', () => {
  it('writes a summary, themes and four questions', async () => {
    const d = deps();
    const result = await runOverviewJob(d, { notebookId: 'nb-1' });

    expect(result).toMatchObject({ status: 'written', questions: SUGGESTED_QUESTION_COUNT });
    expect(d.saved[0].summary).toBe(OVERVIEW.summary);
  });

  it('cuts to four questions rather than failing on five', async () => {
    // A count constraint in a structured-output schema is demoted to prose by
    // the SDK, so the number has to hold here. Failing the whole overview
    // because the model offered five would cost the notebook its summary over
    // something cosmetic.
    const d = deps({
      writeOverview: async () => ({
        ...OVERVIEW,
        suggestedQuestions: ['a?', 'b?', 'c?', 'd?', 'e?'],
      }),
    });

    await runOverviewJob(d, { notebookId: 'nb-1' });
    expect(d.saved[0].suggestedQuestions).toHaveLength(4);
  });

  it('keeps three when the model offered three', async () => {
    const d = deps({
      writeOverview: async () => ({ ...OVERVIEW, suggestedQuestions: ['a?', 'b?', 'c?'] }),
    });

    const result = await runOverviewJob(d, { notebookId: 'nb-1' });
    expect(result.questions).toBe(3);
  });

  it('skips a notebook with nothing ready yet', async () => {
    // The run that follows the next finished source will have something to
    // read. A summary of an empty notebook would sit on the header until then.
    const d = deps({ readySources: async () => [] });
    const result = await runOverviewJob(d, { notebookId: 'nb-1' });

    expect(result.status).toBe('skipped');
    expect(d.saved).toHaveLength(0);
  });

  it('reads only ready sources, never one still being ingested', async () => {
    const readySources = jest.fn<OverviewDeps['readySources']>().mockResolvedValue(sources(2));
    await runOverviewJob(deps({ readySources }), { notebookId: 'nb-7' });

    expect(readySources).toHaveBeenCalledWith('nb-7');
  });

  it('can run twice without harm', async () => {
    // It has no dedupe of its own: it reads the sources as they are and
    // overwrites the notebook's overview fields. A second run is a second
    // snapshot, not a second half of one.
    const d = deps();
    await runOverviewJob(d, { notebookId: 'nb-1' });
    await runOverviewJob(d, { notebookId: 'nb-1' });

    expect(d.saved).toHaveLength(2);
    expect(d.saved[0]).toEqual(d.saved[1]);
  });
});

/** A queue that remembers what is pending, with the states BullMQ reports. */
class FakeQueue {
  readonly jobs = new Map<string, { data: unknown; delay: number; state: string }>();
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

  async add(_name: string, data: unknown, options: { jobId: string; delay: number }) {
    this.adds.push(options.jobId);
    this.jobs.set(options.jobId, { data, delay: options.delay, state: 'delayed' });
  }
}

describe('the debounce', () => {
  let queue: FakeQueue;
  const jobId = dedupeKey('nb-1', 'overview', 'all');

  beforeEach(() => {
    queue = new FakeQueue();
  });

  it('leaves one pending job when three sources are added together', async () => {
    // The case from docs/ARCHITECTURE.md: three uploads in a row must produce
    // one overview, not three.
    for (let index = 0; index < 3; index += 1) {
      await enqueueDebounced(
        'ingest',
        jobId,
        { kind: 'overview', notebookId: 'nb-1' },
        20_000,
        queue as never
      );
    }

    expect(queue.jobs.size).toBe(1);
    expect(queue.adds).toHaveLength(3);
    expect(queue.removes).toHaveLength(2);
  });

  it('pushes the delay out again on every add', async () => {
    await enqueueDebounced('ingest', jobId, { a: 1 }, 20_000, queue as never);
    await enqueueDebounced('ingest', jobId, { a: 2 }, 20_000, queue as never);

    // The surviving job is the newest one, so the run happens after things go
    // quiet rather than twenty seconds after the first source.
    expect(queue.jobs.get(jobId)?.data).toEqual({ a: 2 });
    expect(queue.jobs.get(jobId)?.delay).toBe(20_000);
  });

  it('leaves a job that is already running alone', async () => {
    // Removing it would not stop it, and the id would collide. The run that
    // follows the next source picks up what changed.
    await enqueueDebounced('ingest', jobId, { a: 1 }, 20_000, queue as never);
    queue.jobs.get(jobId)!.state = 'active';

    await enqueueDebounced('ingest', jobId, { a: 2 }, 20_000, queue as never);

    expect(queue.removes).toHaveLength(0);
    expect(queue.jobs.get(jobId)?.data).toEqual({ a: 1 });
  });

  it('uses a job id without a colon, which BullMQ treats as a separator', () => {
    expect(jobId).not.toContain(':');
    expect(jobId).toBe('nb-1.overview.all');
  });
});
