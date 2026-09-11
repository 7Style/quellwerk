/**
 * The source route with its capacity gate, end to end through Express.
 *
 * In-memory repository, a fake notebook access and a token counter that returns
 * what the test tells it to. No database and no model: what is under test is
 * the gate and the status codes, and both are decided above storage.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';

import { errorMiddleware } from '../../../common/middleware/error.middleware.js';
import { createUploadMiddleware } from '../../../common/middleware/upload.middleware.js';
import { SourcesController } from '../controllers/sources.controller.js';
import { createSourcesRouter } from '../routes/sources.routes.js';
import { SourcesService } from '../services/sources.service.js';
import type {
  CreateSourceData,
  NotebookAccess,
  SourceRow,
  SourcesRepository,
} from '../interfaces/sources.repository.js';

const NOTEBOOK = '00000000-0000-4000-8000-000000000001';
const OTHER_NOTEBOOK = '00000000-0000-4000-8000-000000000002';

class InMemorySources implements SourcesRepository {
  readonly rows: SourceRow[] = [];
  readonly texts = new Map<string, string>();
  notebookTokens = 0;
  private next = 0;

  async countByNotebook(notebookId: string): Promise<number> {
    return this.rows.filter((row) => row.notebookId === notebookId).length;
  }

  async maxPosition(notebookId: string): Promise<number> {
    const positions = this.rows.filter((row) => row.notebookId === notebookId).map((row) => row.position);
    return positions.length > 0 ? Math.max(...positions) : 0;
  }

  async create(data: CreateSourceData): Promise<SourceRow> {
    this.next += 1;
    const row: SourceRow = {
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
    };
    this.rows.push(row);
    this.texts.set(row.id, data.text);
    return row;
  }

  async listByNotebook(notebookId: string): Promise<SourceRow[]> {
    return this.rows.filter((row) => row.notebookId === notebookId).sort((a, b) => a.position - b.position);
  }

  async addNotebookTokens(_notebookId: string, tokens: number): Promise<void> {
    this.notebookTokens += tokens;
  }
}

let repository: InMemorySources;
let notebookTokenCount: number;
let tokensForNextSource: number;
let currentSession: string | null;

/** Only NOTEBOOK belongs to session-a; anything else answers the way the real one does. */
const notebooks: NotebookAccess = {
  writable: async (notebookId, sessionId) => {
    if (notebookId !== NOTEBOOK || sessionId !== 'session-a') {
      throw Object.assign(new Error('No such notebook.'), {
        statusCode: 404,
        errorCode: 'NOTEBOOK_NOT_FOUND',
      });
    }
    return { id: notebookId, tokenCount: notebookTokenCount };
  },
};

/** Stands in for multer: puts a file on the request when the test asks for one. */
function fakeUpload(file?: Express.Multer.File): RequestHandler {
  return (req, _res, next) => {
    if (file) req.file = file;
    next();
  };
}

function appFor(upload: RequestHandler = fakeUpload()): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const service = new SourcesService({
    repository,
    notebooks,
    tokens: { countTextTokens: async () => tokensForNextSource },
    limits: { maxSources: 50, maxTokens: 150_000 },
  });
  const controller = new SourcesController(service, () => currentSession);
  app.use('/api', createSourcesRouter({ controller, upload }));
  app.use(errorMiddleware);

  return app;
}

function paste(overrides: Partial<{ title: string; text: string }> = {}) {
  return { kind: 'paste', title: 'Interne Notiz', text: 'Ein Satz Text.', ...overrides };
}

beforeEach(() => {
  repository = new InMemorySources();
  notebookTokenCount = 0;
  tokensForNextSource = 1_000;
  currentSession = 'session-a';
});

describe('a valid pasted source', () => {
  it('is created with 201 and queued for the worker', async () => {
    const response = await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());

    expect(response.status).toBe(201);
    expect(response.body.kind).toBe('paste');
    expect(response.body.status).toBe('queued');
    expect(response.body.position).toBe(1);
    expect(response.body.tokenCount).toBe(1_000);
  });

  it('stores the normalised text, not what was sent', async () => {
    // Normalised exactly once, at ingest (ADR-0003): what is stored is what
    // goes to the model and what offsets point into.
    await request(appFor())
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send(paste({ text: 'Zeile\r\nzwei­drei   \n\n\n\nvier' }));

    expect(repository.texts.get('src-1')).toBe('Zeile\nzweidrei\n\nvier');
  });

  it('never returns the stored text in the response', async () => {
    const response = await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());
    expect(response.body).not.toHaveProperty('text');
  });

  it('adds its tokens to the notebook total', async () => {
    await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());
    expect(repository.notebookTokens).toBe(1_000);
  });

  it('takes the next free position', async () => {
    const app = appFor();
    await request(app).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());
    const second = await request(app).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());

    expect(second.body.position).toBe(2);
  });
});

describe('the capacity gate', () => {
  it('answers 413 at the fifty-first source', async () => {
    for (let index = 0; index < 50; index += 1) {
      await repository.create({
        notebookId: NOTEBOOK,
        position: index + 1,
        title: `Quelle ${index}`,
        kind: 'paste',
        text: 'x',
        charCount: 1,
        tokenCount: 1,
        status: 'ready',
      });
    }

    const response = await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('CAPACITY_EXCEEDED');
    expect(response.body.error.message).toBe(
      'This notebook already holds 50 sources. Remove one before adding another.'
    );
  });

  it('answers 413 when the source would take the notebook over 150,000 tokens', async () => {
    notebookTokenCount = 140_000;
    tokensForNextSource = 20_000;

    const response = await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());

    expect(response.status).toBe(413);
    expect(response.body.error.message).toContain('160,000');
    expect(response.body.error.details.reason).toBe('tokens');
  });

  it('writes nothing when it refuses', async () => {
    notebookTokenCount = 149_000;
    tokensForNextSource = 5_000;

    await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());

    expect(repository.rows).toHaveLength(0);
    expect(repository.notebookTokens).toBe(0);
  });

  it('accepts a source that lands exactly on the limit', async () => {
    notebookTokenCount = 100_000;
    tokensForNextSource = 50_000;

    const response = await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());
    expect(response.status).toBe(201);
  });
});

describe('an uploaded file', () => {
  const file = {
    originalname: 'KI-Verordnung Auszug.pdf',
    mimetype: 'application/pdf',
    path: '/tmp/upload-1',
  } as Express.Multer.File;

  it('is created queued, with no text and no token count yet', async () => {
    // Extraction belongs to the worker (docs/ARCHITECTURE.md), so neither
    // number exists at this point. Writing a zero that looks measured would be
    // worse than writing a zero that is obviously pending.
    const response = await request(appFor(fakeUpload(file)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(response.status).toBe(201);
    expect(response.body.kind).toBe('pdf');
    expect(response.body.status).toBe('queued');
    expect(response.body.charCount).toBe(0);
    expect(response.body.tokenCount).toBe(0);
  });

  it('takes its title from the file name, without the extension', async () => {
    const response = await request(appFor(fakeUpload(file)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(response.body.title).toBe('KI-Verordnung Auszug');
  });

  it('is refused with 413 when the notebook is already full', async () => {
    // The file's own size is still unknown here, but nothing fits in any case.
    notebookTokenCount = 150_000;

    const response = await request(appFor(fakeUpload(file)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(response.status).toBe(413);
    expect(response.body.error.message).toContain('at its limit');
  });

  it('is refused with 415 when the type is not one Quellwerk reads', async () => {
    const image = { ...file, originalname: 'foto.png', mimetype: 'image/png' };

    const response = await request(appFor(fakeUpload(image)))
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send();

    expect(response.status).toBe(415);
    expect(response.body.error.message).toContain('image/png');
  });
});

describe('a file over the size cap', () => {
  it('is refused with 413 by the upload middleware, before any handler sees it', async () => {
    // The real middleware, with a limit small enough to hit without moving
    // twenty megabytes through a test run. What is under test is the path from
    // the configured cap to the status code: multer raises LIMIT_FILE_SIZE and
    // the error middleware has to turn that into 413 and not 400.
    const oneKilobyte = 1_024;
    const app = appFor(createUploadMiddleware(oneKilobyte));

    const response = await request(app)
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .attach('file', Buffer.alloc(oneKilobyte * 4, 'a'), {
        filename: 'gross.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    expect(response.body.error.details.multerCode).toBe('LIMIT_FILE_SIZE');
    expect(repository.rows).toHaveLength(0);
  });

  it('lets a file under the cap through', async () => {
    const app = appFor(createUploadMiddleware(1_024 * 64));

    const response = await request(app)
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .attach('file', Buffer.alloc(1_024, 'a'), {
        filename: 'klein.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(response.body.kind).toBe('pdf');
  });
});

describe('a source for a notebook that is not ours', () => {
  it('answers 404 and not 403', async () => {
    const response = await request(appFor())
      .post(`/api/notebooks/${OTHER_NOTEBOOK}/sources`)
      .send(paste());

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('No such notebook.');
  });

  it('is refused before the capacity gate runs, so nothing leaks about its size', async () => {
    notebookTokenCount = 150_000;

    const response = await request(appFor())
      .post(`/api/notebooks/${OTHER_NOTEBOOK}/sources`)
      .send(paste());

    expect(response.status).toBe(404);
  });
});

describe('bad input', () => {
  it('refuses a pasted source without text with 400', async () => {
    const response = await request(appFor())
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send({ kind: 'paste', title: 'Leer' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses text that is only whitespace with 422 after normalising', async () => {
    // The schema sees a non-empty string; normalising leaves nothing. That is
    // not a malformed request, it is a source with no text in it.
    const response = await request(appFor())
      .post(`/api/notebooks/${NOTEBOOK}/sources`)
      .send(paste({ text: '   \n\n  \t ' }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('EMPTY_SOURCE');
  });

  it('refuses a notebook id that is not a uuid with 400', async () => {
    const response = await request(appFor()).post('/api/notebooks/nope/sources').send(paste());
    expect(response.status).toBe(400);
  });

  it('refuses a request without a session with 400', async () => {
    currentSession = null;
    const response = await request(appFor()).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste());

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_SESSION');
  });
});

describe('GET sources', () => {
  it('lists them in position order', async () => {
    const app = appFor();
    await request(app).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste({ title: 'Eins' }));
    await request(app).post(`/api/notebooks/${NOTEBOOK}/sources`).send(paste({ title: 'Zwei' }));

    const response = await request(app).get(`/api/notebooks/${NOTEBOOK}/sources`);

    expect(response.status).toBe(200);
    expect(response.body.sources.map((s: { title: string }) => s.title)).toEqual(['Eins', 'Zwei']);
  });
});
