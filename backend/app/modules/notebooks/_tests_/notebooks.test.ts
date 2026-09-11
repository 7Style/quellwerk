/**
 * Notebook routes against an in-memory repository.
 *
 * No database: jest.env.ts promises that no test opens one, and the rule this
 * suite is about is not a storage rule. It is "a notebook of another session
 * does not exist", and that is decided in the service, above the repository.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';

import { errorMiddleware } from '../../../common/middleware/error.middleware.js';
import { NotebooksController } from '../controllers/notebooks.controller.js';
import { createNotebooksRouter } from '../routes/notebooks.routes.js';
import { NotebooksService } from '../services/notebooks.service.js';
import type {
  CreateNotebookData,
  NotebookRow,
  NotebooksRepository,
} from '../interfaces/notebooks.repository.js';

class InMemoryNotebooks implements NotebooksRepository {
  readonly rows: NotebookRow[] = [];
  private next = 0;

  async create(data: CreateNotebookData): Promise<NotebookRow> {
    this.next += 1;
    const row: NotebookRow = {
      id: `00000000-0000-4000-8000-${String(this.next).padStart(12, '0')}`,
      sessionId: data.sessionId,
      title: data.title,
      emoji: null,
      userSetTitle: false,
      summary: null,
      suggestedQuestions: null,
      tokenCount: 0,
      tokenModel: null,
      isDemo: false,
      createdAt: new Date('2026-09-11T12:00:00Z'),
      lastUsedAt: new Date('2026-09-11T12:00:00Z'),
    };
    this.rows.push(row);
    return row;
  }

  async findById(id: string): Promise<NotebookRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async listBySession(sessionId: string): Promise<NotebookRow[]> {
    return this.rows.filter((row) => row.sessionId === sessionId);
  }

  async touch(id: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) row.lastUsedAt = new Date('2026-09-12T09:00:00Z');
  }
}

let repository: InMemoryNotebooks;
let currentSession: string | null;

function appFor(): Express {
  const app = express();
  app.use(express.json());

  const service = new NotebooksService({ repository });
  const controller = new NotebooksController(service, () => currentSession);
  app.use('/api', createNotebooksRouter(controller));
  app.use(errorMiddleware);

  return app;
}

beforeEach(() => {
  repository = new InMemoryNotebooks();
  currentSession = 'session-a';
});

describe('POST /api/notebooks', () => {
  it('creates a notebook for the calling session', async () => {
    const response = await request(appFor()).post('/api/notebooks').send({ title: 'KI-Verordnung' });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('KI-Verordnung');
    expect(repository.rows[0].sessionId).toBe('session-a');
  });

  it('never returns the session id', async () => {
    // It is the one field that says who owns the row. A client that never sees
    // one cannot try someone else's.
    const response = await request(appFor()).post('/api/notebooks').send({ title: 'X' });
    expect(response.body).not.toHaveProperty('sessionId');
  });

  it('falls back to the default title when none is given', async () => {
    const response = await request(appFor()).post('/api/notebooks').send({});
    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Untitled notebook');
  });

  it('treats a title of only spaces as none', async () => {
    const response = await request(appFor()).post('/api/notebooks').send({ title: '     ' });
    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Untitled notebook');
  });

  it('refuses a title over the schema length with 400', async () => {
    const response = await request(appFor())
      .post('/api/notebooks')
      .send({ title: 'z'.repeat(121) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a request without a session with 400', async () => {
    currentSession = null;
    const response = await request(appFor()).post('/api/notebooks').send({ title: 'X' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('cookies');
  });
});

describe('GET /api/notebooks', () => {
  it('lists only the notebooks of the calling session', async () => {
    const app = appFor();
    await request(app).post('/api/notebooks').send({ title: 'meins' });

    currentSession = 'session-b';
    await request(app).post('/api/notebooks').send({ title: 'fremdes' });

    const response = await request(app).get('/api/notebooks');
    expect(response.status).toBe(200);
    expect(response.body.notebooks.map((n: { title: string }) => n.title)).toEqual(['fremdes']);
  });
});

describe('GET /api/notebooks/:id', () => {
  it('returns the notebook and marks it as used', async () => {
    const app = appFor();
    const created = await request(app).post('/api/notebooks').send({ title: 'meins' });

    const response = await request(app).get(`/api/notebooks/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
    // The cleanup job (M7-T5) deletes what nobody touched for seven days, so
    // opening a notebook has to count as touching it.
    expect(repository.rows[0].lastUsedAt.toISOString()).toBe('2026-09-12T09:00:00.000Z');
  });

  it('answers 404 for a notebook of another session, not 403', async () => {
    // A 403 would confirm that the id exists and belongs to somebody. Both
    // cases have to look identical from outside (SECURITY.md 7.2).
    const app = appFor();
    const created = await request(app).post('/api/notebooks').send({ title: 'meins' });

    currentSession = 'session-b';
    const response = await request(app).get(`/api/notebooks/${created.body.id}`);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('No such notebook.');
  });

  it('answers the same 404 for an id that never existed', async () => {
    const response = await request(appFor()).get(
      '/api/notebooks/00000000-0000-4000-8000-999999999999'
    );

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('No such notebook.');
  });

  it('refuses an id that is not a uuid with 400', async () => {
    const response = await request(appFor()).get('/api/notebooks/nicht-uuid');
    expect(response.status).toBe(400);
  });
});

describe('the demo notebook', () => {
  it('is readable by any session but writable by none', async () => {
    repository.rows.push({
      id: '00000000-0000-4000-8000-00000000demo'.slice(0, 36),
      sessionId: null,
      title: 'Demo',
      emoji: null,
      userSetTitle: false,
      summary: null,
      suggestedQuestions: null,
      tokenCount: 0,
      tokenModel: null,
      isDemo: true,
      createdAt: new Date('2026-09-11T12:00:00Z'),
      lastUsedAt: new Date('2026-09-11T12:00:00Z'),
    });
    const demoId = repository.rows[0].id;

    const service = new NotebooksService({ repository });

    await expect(service.readable(demoId, 'anyone')).resolves.toHaveProperty('isDemo', true);
    // Writable stays closed until copy-on-first-write exists (M7-T1). Until
    // then a write must not happen at all rather than happen to the original.
    await expect(service.writable(demoId, 'anyone')).rejects.toThrow('No such notebook.');
  });
});
