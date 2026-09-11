/**
 * The anonymous session, tested through a real Express 5 app.
 *
 * express-session does not document Express 5 support anywhere; its README
 * still describes Express 4 middleware. That is not a reason to guess, it is a
 * reason to assert: everything below runs against an actual app with an actual
 * cookie jar, so "it works under Express 5" is a test result and not a hope.
 *
 * The store is express-session's in-memory one. What is under test is the
 * contract of the module, not Redis.
 */
import { describe, expect, it } from '@jest/globals';
import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';

import { initSessionModule, sessionIdOf } from '../index.js';

const COOKIE_NAME = 'qw.sid';
const SECRET = 'test-secret-that-is-long-enough-for-a-test';

function appWithSession(overrides: { isProduction?: boolean; maxAgeMs?: number } = {}): Express {
  const app = express();
  app.set('trust proxy', 1);

  initSessionModule(app, {
    sessionSecret: SECRET,
    cookieName: COOKIE_NAME,
    maxAgeMs: overrides.maxAgeMs ?? 2_592_000_000,
    isProduction: overrides.isProduction ?? false,
    store: new session.MemoryStore(),
  });

  const whoami = (req: import('express').Request, res: import('express').Response): void => {
    res.json({ sessionId: sessionIdOf(req), createdAt: req.session.createdAt ?? null });
  };
  app.get('/whoami', whoami);
  app.get('/health', whoami);

  return app;
}

/** The Set-Cookie line for our cookie, or undefined when none was sent. */
function sessionCookie(headers: Record<string, unknown>): string | undefined {
  const raw = headers['set-cookie'];
  const all = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return all.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

describe('a request without a cookie', () => {
  it('gets a session and a cookie back', async () => {
    const response = await request(appWithSession()).get('/whoami');

    expect(response.status).toBe(200);
    expect(response.body.sessionId).toEqual(expect.any(String));
    expect(response.body.sessionId.length).toBeGreaterThan(16);

    const cookie = sessionCookie(response.headers);
    expect(cookie).toBeDefined();
  });

  it('stamps the session so it is stored at all', async () => {
    // With saveUninitialized:false an untouched session is never written and
    // no cookie goes out. ensureSession() is what turns the first request into
    // a stored session; without it the second request would start over.
    const response = await request(appWithSession()).get('/whoami');
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(new Date(response.body.createdAt).toString()).not.toBe('Invalid Date');
  });
});

describe('a second request with the cookie', () => {
  it('keeps the same session', async () => {
    const agent = request.agent(appWithSession());

    const first = await agent.get('/whoami');
    const second = await agent.get('/whoami');

    expect(second.body.sessionId).toBe(first.body.sessionId);
    expect(second.body.createdAt).toBe(first.body.createdAt);
  });

  it('starts a new session when the cookie is not sent', async () => {
    const app = appWithSession();

    const first = await request(app).get('/whoami');
    const second = await request(app).get('/whoami');

    expect(second.body.sessionId).not.toBe(first.body.sessionId);
  });

  it('starts a new session when the cookie was tampered with', async () => {
    // The cookie is signed. A changed id must not be accepted, otherwise
    // anyone could name someone else's session and read their notebooks.
    const app = appWithSession();
    const first = await request(app).get('/whoami');
    const cookie = sessionCookie(first.headers) ?? '';
    const forged = cookie.replace(/^qw\.sid=[^;]+/, 'qw.sid=s%3Aforged.signature');

    const second = await request(app).get('/whoami').set('Cookie', forged);

    expect(second.status).toBe(200);
    expect(second.body.sessionId).not.toBe(first.body.sessionId);
  });
});

describe('the cookie itself', () => {
  it('is httpOnly, lax and scoped to the whole site', async () => {
    const cookie = sessionCookie((await request(appWithSession()).get('/whoami')).headers) ?? '';

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('is not marked secure outside production, or the browser would drop it on http', async () => {
    const cookie = sessionCookie((await request(appWithSession()).get('/whoami')).headers) ?? '';
    expect(cookie).not.toContain('Secure');
  });

  it('is marked secure in production, behind the proxy', async () => {
    // Behind the host nginx the hop to the container is plain http. `trust
    // proxy` plus X-Forwarded-Proto is what lets express-session see that the
    // connection really was TLS; without it the cookie would be dropped.
    const response = await request(appWithSession({ isProduction: true }))
      .get('/whoami')
      .set('X-Forwarded-Proto', 'https');

    expect(sessionCookie(response.headers) ?? '').toContain('Secure');
  });

  it('carries the configured lifetime', async () => {
    // express-session serialises maxAge as an absolute `Expires` date, not as
    // `Max-Age`. Measured, not assumed: the first version of this test looked
    // for Max-Age and failed against a perfectly correct cookie.
    const oneHour = 3_600_000;
    const before = Date.now();
    const cookie =
      sessionCookie((await request(appWithSession({ maxAgeMs: oneHour })).get('/whoami')).headers) ?? '';

    const match = /Expires=([^;]+)/.exec(cookie);
    expect(match).not.toBeNull();

    const expires = new Date(match?.[1] ?? '').getTime();
    // Cookie dates have second resolution, so this compares with a minute of
    // slack rather than to the millisecond.
    expect(Math.abs(expires - (before + oneHour))).toBeLessThan(60_000);
  });
});

describe('the health endpoints', () => {
  it('never start a session, so a liveness probe cannot fill Redis', async () => {
    // The container healthcheck polls /health every fifteen seconds. Stamping
    // it would write a session key per poll, 5,760 a day, each alive for thirty
    // days, for a caller that never returns with a cookie.
    const response = await request(appWithSession()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.createdAt).toBeNull();
    expect(sessionCookie(response.headers)).toBeUndefined();
  });

  it('still read a session that is already there', async () => {
    // Skipping means "do not create one here", not "ignore the caller".
    const agent = request.agent(appWithSession());
    const first = await agent.get('/whoami');
    const onHealth = await agent.get('/health');

    expect(onHealth.body.sessionId).toBe(first.body.sessionId);
  });
});

describe('sessionIdOf', () => {
  it('answers null when there is no session, instead of throwing', () => {
    // Called on a route that has no session middleware, it must not take the
    // request down; the caller decides what a missing session means.
    expect(sessionIdOf({})).toBeNull();
    expect(sessionIdOf({ session: {} })).toBeNull();
    expect(sessionIdOf({ session: { id: 'abc' } })).toBe('abc');
  });
});
