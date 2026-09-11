/**
 * The ingestion path in one piece: an HTTP request goes in, a source comes out
 * ready, and the job that did it ran against a fake model.
 *
 * The other suites cut this path into parts and test each one. This one exists
 * because the parts have to fit: the route writes a row and hands over an id,
 * and the job has to find exactly that row and be able to finish it. The two
 * were wired through different code for a while, and nothing noticed until the
 * whole chain ran.
 *
 * Still no Redis, no Prisma, no API key. The queue is an array, storage is a
 * Map, and the model is a function that returns a fixed object.
 */
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach } from '@jest/globals';
import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';

import { errorMiddleware } from '../../../common/middleware/error.middleware.js';
import { SourcesController } from '../controllers/sources.controller.js';
import { createSourcesRouter } from '../routes/sources.routes.js';
import { SourcesService } from '../services/sources.service.js';
import {
  runIngestJob,
  type IngestDeps,
  type IngestSourceRow,
  type IngestStep,
} from '../internal/ingest.job.js';
import type {
  CreateSourceData,
  NotebookAccess,
  SourceRow,
  SourcesRepository,
} from '../interfaces/sources.repository.js';

const NOTEBOOK = '00000000-0000-4000-8000-00000000000a';

/**
 * One store behind both halves. The route writes into it, the job reads the
 * same rows back; a second fake for the job would let the two drift apart and
 * hide exactly the mismatch this file is here to catch.
 */
class Store implements SourcesRepository {
  readonly rows = new Map<string, SourceRow & { text: string; storagePath: string | null; pages?: unknown; guide?: unknown }>();
  notebookTokens = 0;
  titleClaimed = false;
  readonly queue: Array<{ sourceId: string; notebookId: string }> = [];
  readonly overviewRequests: string[] = [];
  readonly steps: IngestStep[] = [];
  /** Upload paths the job released after their text was stored. */
  readonly discarded: string[] = [];
  private next = 0;

  async countByNotebook(notebookId: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.notebookId === notebookId).length;
  }

  async maxPosition(notebookId: string): Promise<number> {
    const positions = [...this.rows.values()]
      .filter((row) => row.notebookId === notebookId)
      .map((row) => row.position);
    return positions.length > 0 ? Math.max(...positions) : 0;
  }

  async create(data: CreateSourceData): Promise<SourceRow> {
    this.next += 1;
    const row = {
      id: `src-${this.next}`,
      notebookId: data.notebookId,
      position: data.position,
      title: data.title,
      kind: data.kind,
      status: data.status,
      step: null,
      error: null,
      charCount: data.charCount,
      tokenCount: data.tokenCount,
      createdAt: new Date('2026-09-11T12:00:00Z'),
      text: data.text,
      storagePath: data.storagePath ?? null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async listByNotebook(notebookId: string): Promise<SourceRow[]> {
    return [...this.rows.values()].filter((row) => row.notebookId === notebookId);
  }

  async addNotebookTokens(_notebookId: string, tokens: number): Promise<void> {
    this.notebookTokens += tokens;
  }

  /** The job's side of the same store. */
  ingestDeps(fileBytes: Buffer, tokensForText = 1_500): IngestDeps {
    return {
      getSource: async (sourceId) => (this.rows.get(sourceId) as IngestSourceRow | undefined) ?? null,
      updateSource: async (sourceId, update) => {
        const row = this.rows.get(sourceId);
        if (row) Object.assign(row, update);
      },
      heartbeat: async (sourceId, step) => {
        this.steps.push(step);
        const row = this.rows.get(sourceId);
        if (row) Object.assign(row, { step, status: 'processing' });
      },
      readFile: async () => fileBytes,
      discardFile: async (path) => {
        this.discarded.push(path);
      },
      countTextTokens: async () => tokensForText,
      addNotebookTokens: async (_id, tokens) => {
        this.notebookTokens += tokens;
      },
      claimTitle: async () => {
        if (this.titleClaimed) return false;
        this.titleClaimed = true;
        return true;
      },
      notebookTokens: async () => this.notebookTokens,
      // The fake model. Fixed answers, so what is under test is the plumbing
      // and not the wording of a summary.
      writeGuide: async () => ({
        summary: 'Zusammenfassung.',
        topics: ['Eins', 'Zwei', 'Drei'],
        language: 'German',
        hasInstructions: false,
      }),
      writeNotebookTitle: async () => ({ title: 'Ein Titel', emoji: '📘' }),
      setNotebookTitle: async () => undefined,
      requestOverview: async (notebookId) => {
        this.overviewRequests.push(notebookId);
      },
      maxTokensPerNotebook: 150_000,
    };
  }
}

let store: Store;

const notebooks: NotebookAccess = {
  writable: async () => ({ id: NOTEBOOK, tokenCount: store.notebookTokens }),
};

/** Stands in for multer, so a file arrives without touching the disk. */
function uploadOf(file?: Express.Multer.File): RequestHandler {
  return (req, _res, next) => {
    if (file) req.file = file;
    next();
  };
}

function appFor(upload: RequestHandler = uploadOf()): Express {
  const app = express();
  app.use(express.json());

  const service = new SourcesService({
    repository: store,
    notebooks,
    tokens: { countTextTokens: async () => 800 },
    limits: { maxSources: 50, maxTokens: 150_000 },
    enqueueIngest: async (job) => {
      store.queue.push(job);
    },
    assertBudgetLeft: async () => undefined,
  });

  app.use('/api', createSourcesRouter({
    controller: new SourcesController(service, () => 'session-a'),
    upload,
    limit: (_req, _res, next) => next(),
  }));
  app.use(errorMiddleware);
  return app;
}

/** A valid PDF with one page and no text on it. */
const BLANK_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1'
);

beforeEach(() => {
  store = new Store();
});

describe('pasted text, from the request to a ready source', () => {
  it('is queued by the route and finished by the job', async () => {
    const created = await request(appFor())
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send({ kind: 'paste', title: 'Notiz', text: 'Ein Satz.' });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('queued');

    // The job the route handed over, run with the same store behind it.
    expect(store.queue).toHaveLength(1);
    const result = await runIngestJob(store.ingestDeps(Buffer.alloc(0)), store.queue[0]);

    expect(result.status).toBe('ready');
    const source = store.rows.get(created.body.id);
    expect(source?.status).toBe('ready');
    expect(source?.step).toBeNull();
    expect(source?.error).toBeNull();
    expect(source?.guide).toMatchObject({ language: 'German' });
  });

  it('shows the source as ready through the route afterwards', async () => {
    const app = appFor();
    await request(app)
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send({ kind: 'paste', title: 'Notiz', text: 'Ein Satz.' });
    await runIngestJob(store.ingestDeps(Buffer.alloc(0)), store.queue[0]);

    const listed = await request(app).get(`/api/notebooks/${NOTEBOOK}/sources`);
    expect(listed.body.sources[0]).toMatchObject({ status: 'ready', title: 'Notiz' });
  });

  it('counts its tokens once, at the route', async () => {
    await request(appFor())
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send({ kind: 'paste', title: 'Notiz', text: 'Ein Satz.' });
    const afterRoute = store.notebookTokens;

    await runIngestJob(store.ingestDeps(Buffer.alloc(0)), store.queue[0]);

    expect(afterRoute).toBe(800);
    expect(store.notebookTokens).toBe(800);
  });
});

describe('an uploaded file, from the request to a ready source', () => {
  const file = {
    originalname: 'Bericht.md',
    mimetype: 'text/markdown',
    path: '/tmp/upload',
  } as Express.Multer.File;

  it('is extracted and measured by the job, not by the route', async () => {
    const created = await request(appFor(uploadOf(file)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(created.body.tokenCount).toBe(0);
    expect(store.notebookTokens).toBe(0);

    const bytes = Buffer.from('Zeile eins\r\n\r\n\r\nZeile zwei', 'utf8');
    const result = await runIngestJob(store.ingestDeps(bytes, 2_400), store.queue[0]);

    expect(result.status).toBe('ready');
    expect(store.notebookTokens).toBe(2_400);
    expect(store.rows.get(created.body.id)?.text).toBe('Zeile eins\n\nZeile zwei');
    // The bytes have become text, so the file is released. The text is the
    // source from here on (ADR-0003).
    expect(store.discarded).toEqual(['/tmp/upload']);
  });
});

describe('a PDF without a text layer', () => {
  const scan = {
    originalname: 'Scan.pdf',
    mimetype: 'application/pdf',
    path: '/tmp/scan.pdf',
  } as Express.Multer.File;

  it('ends as failed with a reason, never as a hanging job', async () => {
    // The case the whole status machinery exists for. A source left on `queued`
    // is a spinner that never stops, which docs/SPEC.md forbids outright.
    const created = await request(appFor(uploadOf(scan)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(created.status).toBe(201);

    const result = await runIngestJob(store.ingestDeps(BLANK_PDF), store.queue[0]);

    expect(result.status).toBe('failed');
    const source = store.rows.get(created.body.id);
    expect(source?.status).toBe('failed');
    expect(source?.step).toBeNull();
    expect(source?.error).toContain('no text layer');
    expect(source?.error).toContain('scans');
  }, 30_000);

  it('leaves the token count of the notebook untouched', async () => {
    await request(appFor(uploadOf(scan))).post(`/api/notebooks/${NOTEBOOK}/sources`).send();
    await runIngestJob(store.ingestDeps(BLANK_PDF), store.queue[0]);

    expect(store.notebookTokens).toBe(0);
  }, 30_000);

  it('asks for no overview, because there is nothing new to summarise', async () => {
    await request(appFor(uploadOf(scan))).post(`/api/notebooks/${NOTEBOOK}/sources`).send();
    await runIngestJob(store.ingestDeps(BLANK_PDF), store.queue[0]);

    expect(store.overviewRequests).toHaveLength(0);
  }, 30_000);
});

describe('an upload nothing takes ownership of', () => {
  it('is removed from the disk instead of lying there for ever', async () => {
    // Real bytes on the real disk, because the whole point is whether the file
    // survives. A refused upload that stays is 20 MB nobody owns: no row points
    // at it, and the cleanup job in M7-T5 walks notebooks and never sees it.
    const dir = await mkdtemp(path.join(tmpdir(), 'quellwerk-upload-'));
    const file = path.join(dir, 'upload');
    await writeFile(file, 'x'.repeat(1_000));

    const rejected = {
      originalname: 'foto.png',
      mimetype: 'image/png',
      path: file,
    } as Express.Multer.File;

    const response = await request(appFor(uploadOf(rejected)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(response.status).toBe(415);
    await expect(access(file)).rejects.toThrow();
  });

  it('is kept when it did become a source', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quellwerk-upload-'));
    const file = path.join(dir, 'upload');
    await writeFile(file, 'Ein Text.');

    const accepted = {
      originalname: 'notiz.md',
      mimetype: 'text/markdown',
      path: file,
    } as Express.Multer.File;

    const response = await request(appFor(uploadOf(accepted)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(response.status).toBe(201);
    // Still there: the job has not run yet and needs the bytes.
    await expect(access(file)).resolves.toBeUndefined();
  });
});

describe('the whole path', () => {
  it('writes a heartbeat at every step, so a stalled job is findable', async () => {
    // Stalled work is found through the (status, heartbeatAt) index rather than
    // a job table (ADR-0009). That only works if the steps are actually written.
    await request(appFor())
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send({ kind: 'paste', title: 'Notiz', text: 'Ein Satz.' });
    await runIngestJob(store.ingestDeps(Buffer.alloc(0)), store.queue[0]);

    expect(store.steps).toEqual(['extract', 'guide', 'title', 'done']);
  });

  it('asks for exactly one overview per finished source', async () => {
    const app = appFor();
    for (const title of ['Eins', 'Zwei']) {
      await request(app)
        .post(`/api/notebooks/${NOTEBOOK}/sources`)
        .send({ kind: 'paste', title, text: `Text ${title}.` });
    }
    for (const job of store.queue) {
      await runIngestJob(store.ingestDeps(Buffer.alloc(0)), job);
    }

    // Two requests. The debounce in the queue turns them into one run; that is
    // tested where it lives, in overview.job.test.ts.
    expect(store.overviewRequests).toEqual([NOTEBOOK, NOTEBOOK]);
  });

  it('writes one notebook title however many sources finish', async () => {
    const app = appFor();
    for (const title of ['Eins', 'Zwei']) {
      await request(app)
        .post(`/api/notebooks/${NOTEBOOK}/sources`)
        .send({ kind: 'paste', title, text: `Text ${title}.` });
    }

    const deps = store.ingestDeps(Buffer.alloc(0));
    await Promise.all(store.queue.map((job) => runIngestJob(deps, job)));

    expect(store.steps.filter((step) => step === 'title')).toHaveLength(1);
  });
});
