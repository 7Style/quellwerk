import { beforeAll, describe, expect, it } from '@jest/globals';
import express, { type Express } from 'express';
import cors from 'cors';
import request from 'supertest';

const ALLOWED = 'https://app.example.test';

describe('CORS allowlist', () => {
  let app: Express;

  beforeAll(async () => {
    // env.config.ts reads the environment once at import time
    process.env.CORS_ORIGIN = ALLOWED;
    const { corsOptionsDelegate } = await import('../cors.config.js');

    app = express();
    app.use(cors(corsOptionsDelegate));
    app.get('/health', (_req, res) => {
      res.json({ status: 'healthy' });
    });
  });

  it('serves a listed origin with CORS headers and credentials', async () => {
    const response = await request(app).get('/health').set('Origin', ALLOWED);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('serves an unlisted origin without CORS headers instead of a 500', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'healthy' });
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    expect(response.headers).not.toHaveProperty('access-control-allow-credentials');
  });

  it('answers a preflight from an unlisted origin without CORS headers and without a 500', async () => {
    const response = await request(app)
      .options('/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');

    // cors does not short-circuit the preflight for a disallowed origin; the
    // request falls through to Express' default OPTIONS handling (200).
    expect(response.status).toBeLessThan(400);
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    expect(response.headers).not.toHaveProperty('access-control-allow-methods');
  });

  it('answers a preflight from a listed origin with 204 and the allowed methods', async () => {
    const response = await request(app)
      .options('/health')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-allow-methods']).toContain('GET');
  });

  it('serves requests without an Origin header, but never with credentials', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers).not.toHaveProperty('access-control-allow-credentials');
  });
});
