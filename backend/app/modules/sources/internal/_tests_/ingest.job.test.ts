/**
 * The ingest job, run with everything handed in.
 *
 * No Redis, no Prisma, no API key: the processor is a plain function, and the
 * two properties worth testing are properties of that function. Whether BullMQ
 * delivers a job twice is BullMQ's business; whether running it twice is safe
 * is ours.
 */
import { describe, expect, it, jest } from '@jest/globals';

import {
  runIngestJob,
  type IngestDeps,
  type IngestSourceRow,
  type IngestStep,
  type NotebookTitle,
  type SourceGuide,
} from '../ingest.job.js';

const GUIDE: SourceGuide = {
  summary: 'Eine interne Notiz zum Stand der Vorbereitung.',
  topics: ['KI-Verordnung', 'Compliance', 'Fristen'],
  language: 'German',
  hasInstructions: true,
};

const TITLE: NotebookTitle = { title: 'KI-Verordnung, Vorbereitung', emoji: '⚖️' };

interface Harness {
  deps: IngestDeps;
  row: IngestSourceRow;
  steps: IngestStep[];
  updates: Array<Record<string, unknown>>;
  notebookTokensAdded: number;
  overviewRequests: number;
  titleCalls: number;
  guideCalls: number;
}

function harness(overrides: Partial<IngestSourceRow> = {}, options: Partial<{
  notebookTokens: number;
  titleClaimed: boolean;
  maxTokens: number;
  tokensForText: number;
  fileText: string;
  guideThrows: Error;
}> = {}): Harness {
  const row: IngestSourceRow = {
    id: 'src-1',
    notebookId: 'nb-1',
    position: 1,
    title: 'Interne Notiz',
    kind: 'paste',
    status: 'queued',
    text: 'Ein Satz Text.',
    tokenCount: 42,
    storagePath: null,
    ...overrides,
  };

  const state: Harness = {
    row,
    steps: [],
    updates: [],
    notebookTokensAdded: 0,
    overviewRequests: 0,
    titleCalls: 0,
    guideCalls: 0,
    deps: {} as IngestDeps,
  };

  state.deps = {
    getSource: async () => state.row,
    updateSource: async (_id, update) => {
      state.updates.push(update as Record<string, unknown>);
      if (update.status) state.row = { ...state.row, status: update.status };
      if (update.text !== undefined) state.row = { ...state.row, text: update.text };
    },
    heartbeat: async (_id, step) => {
      state.steps.push(step);
    },
    readFile: async () => Buffer.from(options.fileText ?? 'Text aus der Datei.', 'utf8'),
    countTextTokens: async () => options.tokensForText ?? 1_000,
    addNotebookTokens: async (_id, tokens) => {
      state.notebookTokensAdded += tokens;
    },
    claimTitle: async () => options.titleClaimed ?? true,
    notebookTokens: async () => options.notebookTokens ?? 0,
    writeGuide: async () => {
      state.guideCalls += 1;
      if (options.guideThrows) throw options.guideThrows;
      return GUIDE;
    },
    writeNotebookTitle: async () => {
      state.titleCalls += 1;
      return TITLE;
    },
    setNotebookTitle: async () => undefined,
    requestOverview: async () => {
      state.overviewRequests += 1;
    },
    maxTokensPerNotebook: options.maxTokens ?? 150_000,
  };

  return state;
}

describe('a pasted source', () => {
  it('ends ready and asks for one overview', async () => {
    const h = harness();
    const result = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(result.status).toBe('ready');
    expect(h.overviewRequests).toBe(1);
    expect(h.updates.at(-1)).toMatchObject({ status: 'ready', step: null, error: null });
  });

  it('is not counted a second time', async () => {
    // The route already measured it and credited the notebook. Counting again
    // here would add the same tokens twice and the capacity gate would start
    // refusing a notebook that is not full.
    const h = harness({ tokenCount: 42 });
    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(h.notebookTokensAdded).toBe(0);
    expect(h.steps).not.toContain('measure');
  });

  it('writes a heartbeat before every step it runs', async () => {
    const h = harness();
    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    // extract, guide, title, done. No measure: the route did that.
    expect(h.steps).toEqual(['extract', 'guide', 'title', 'done']);
  });
});

describe('an uploaded file', () => {
  it('is extracted, measured and credited to the notebook', async () => {
    const h = harness(
      { kind: 'md', text: '', tokenCount: 0, storagePath: '/tmp/upload-1' },
      { tokensForText: 2_500, fileText: 'Zeile eins\r\n\r\n\r\nZeile zwei' }
    );

    const result = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(result.status).toBe('ready');
    expect(h.notebookTokensAdded).toBe(2_500);
    expect(h.steps).toEqual(['extract', 'measure', 'guide', 'title', 'done']);
  });

  it('stores the normalised text, not the bytes', async () => {
    const h = harness(
      { kind: 'md', text: '', tokenCount: 0, storagePath: '/tmp/upload-1' },
      { fileText: 'Zeile eins\r\n\r\n\r\n\r\nZeile zwei   ' }
    );
    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    const stored = h.updates.find((update) => update.text !== undefined);
    expect(stored?.text).toBe('Zeile eins\n\nZeile zwei');
  });

  it('fails with a reason when it would take the notebook over the cap', async () => {
    // The same limit as the route, at the point where the number first exists
    // for a file. Here it ends the job rather than a request.
    const h = harness(
      { kind: 'md', text: '', tokenCount: 0, storagePath: '/tmp/big' },
      { tokensForText: 20_000, notebookTokens: 140_000, maxTokens: 150_000 }
    );

    const result = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('160,000');
    expect(h.updates.at(-1)).toMatchObject({ status: 'failed', step: null });
    expect(h.notebookTokensAdded).toBe(0);
    expect(h.overviewRequests).toBe(0);
  });

  it('fails with a readable reason when the file has no text layer', async () => {
    const h = harness(
      { kind: 'pdf', text: '', tokenCount: 0, storagePath: '/tmp/scan.pdf' },
      { fileText: 'x' }
    );

    const result = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/could not be read|no text layer|no text in that source/);
  });

  it('fails rather than hangs when there is neither text nor a file', async () => {
    const h = harness({ text: '', tokenCount: 0, storagePath: null });
    const result = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(result.status).toBe('failed');
    expect(h.updates.at(-1)).toMatchObject({ status: 'failed' });
  });
});

describe('running the same job twice', () => {
  it('produces one result', async () => {
    // BullMQ's job id stops a second enqueue. This is the guard that holds when
    // a job is retried after a crash, which the job id cannot.
    const h = harness();

    const first = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });
    const second = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(first.status).toBe('ready');
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('already ready');

    // One guide, one title, one overview request. Not two of anything.
    expect(h.guideCalls).toBe(1);
    expect(h.titleCalls).toBe(1);
    expect(h.overviewRequests).toBe(1);
    expect(h.notebookTokensAdded).toBe(0);
  });

  it('does not bill the model twice for an upload', async () => {
    const h = harness(
      { kind: 'md', text: '', tokenCount: 0, storagePath: '/tmp/u' },
      { tokensForText: 900 }
    );

    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });
    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(h.guideCalls).toBe(1);
    expect(h.notebookTokensAdded).toBe(900);
  });
});

describe('the notebook title', () => {
  it('is written by the job that wins the claim', async () => {
    const h = harness({}, { titleClaimed: true });
    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(h.titleCalls).toBe(1);
  });

  it('is not written by a job that lost the claim', async () => {
    // Two ingest jobs run side by side. A count of finished sources reads zero
    // in both of them at the same moment and both write a title; an atomic
    // claim answers true exactly once. Measured on the running stack, where the
    // count version produced two notebook-title rows in usage_log for one
    // notebook.
    const h = harness({}, { titleClaimed: false });
    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(h.titleCalls).toBe(0);
    expect(h.steps).not.toContain('title');
  });

  it('claims exactly once across two concurrent jobs', async () => {
    // The claim is what decides it, so this checks the shape the job relies on:
    // one true, one false, whichever order they arrive in.
    let granted = 0;
    const claim = async (): Promise<boolean> => {
      granted += 1;
      return granted === 1;
    };

    const first = harness();
    const second = harness();
    first.deps.claimTitle = claim;
    second.deps.claimTitle = claim;

    await Promise.all([
      runIngestJob(first.deps, { sourceId: 'src-1', notebookId: 'nb-1' }),
      runIngestJob(second.deps, { sourceId: 'src-2', notebookId: 'nb-1' }),
    ]);

    expect(first.titleCalls + second.titleCalls).toBe(1);
  });

  it('follows the language the guide reported', async () => {
    const h = harness();
    const spy = jest.spyOn(h.deps, 'writeNotebookTitle');

    await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(spy).toHaveBeenCalledWith(expect.anything(), 'German');
  });
});

describe('a source that disappeared', () => {
  it('is skipped without an error', async () => {
    const h = harness();
    h.deps.getSource = async () => null;

    const result = await runIngestJob(h.deps, { sourceId: 'gone', notebookId: 'nb-1' });

    expect(result.status).toBe('skipped');
    expect(h.updates).toHaveLength(0);
  });
});

describe('a failing model call', () => {
  it('ends the source as failed with the reason, never on queued', async () => {
    // A source stuck on queued is a spinner that never stops, which the spec
    // forbids outright.
    const h = harness({}, { guideThrows: new Error('upstream 529') });

    const result = await runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' });

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('upstream 529');
    expect(h.updates.at(-1)).toMatchObject({ status: 'failed', error: 'upstream 529' });
    expect(h.overviewRequests).toBe(0);
  });
});

describe('the guide', () => {
  it('is trimmed to eight topics, because the schema cannot enforce a count', () => {
    // Enforced in code: a count constraint in a structured-output schema is
    // demoted to prose by the SDK rather than honoured (prompts/README.md).
    const many = Array.from({ length: 20 }, (_, index) => `Thema ${index}`);
    const h = harness();
    h.deps.writeGuide = async () => ({ ...GUIDE, topics: many });

    return runIngestJob(h.deps, { sourceId: 'src-1', notebookId: 'nb-1' }).then(() => {
      const written = h.updates.find((update) => update.guide !== undefined);
      expect((written?.guide as SourceGuide).topics).toHaveLength(8);
    });
  });
});
