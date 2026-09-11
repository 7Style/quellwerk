/**
 * The anonymous session (ADR-0005): a signed cookie over a Redis store, thirty
 * days, no accounts and no sign-up step before the first question.
 *
 * Everything a notebook belongs to hangs off `req.session.id`. A notebook of a
 * different session answers 404 rather than 403, so a guessed id is never
 * confirmed (M7-T1).
 */
import session from 'express-session';
import type { RequestHandler } from 'express';

export interface SessionOptions {
  secret: string;
  cookieName: string;
  maxAgeMs: number;
  isProduction: boolean;
  /**
   * Redis in the application, left out in tests, where express-session's own
   * in-memory store is exactly right: it makes the middleware testable without
   * a running Redis and it is never reached in production, because app.ts
   * always passes a store.
   */
  store?: session.Store;
}

/**
 * `saveUninitialized: false` means a session is only written once something is
 * put into it. For an anonymous product that is the wrong default on its own:
 * the first request would carry no cookie, and the notebook created by the
 * second request would belong to a session the first one never saw. So the
 * middleware below stamps every fresh session once, which is what turns it into
 * a stored one.
 *
 * The alternative, `saveUninitialized: true`, would write a Redis key for every
 * crawler that ever touches the site.
 */
export function createSessionMiddleware(options: SessionOptions): RequestHandler {
  return session({
    name: options.cookieName,
    secret: options.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    ...(options.store ? { store: options.store } : {}),
    cookie: {
      httpOnly: true,
      // Lax, not Strict: the demo is opened from a link in a chat or a mail,
      // and Strict would drop the cookie on that first navigation.
      sameSite: 'lax',
      // Behind the host nginx the connection is TLS, but the hop to the
      // container is not. `trust proxy` is set in app.ts, which is what lets
      // express-session see the original protocol (SECURITY.md 7.1).
      secure: options.isProduction,
      maxAge: options.maxAgeMs,
      path: '/',
    },
  });
}

/**
 * Gives a brand new session something to hold, so it is persisted and the
 * cookie goes out with the very first response.
 *
 * `createdAt` is not decoration: the cleanup job (M7-T5) deletes notebooks that
 * nobody has touched for seven days, and a session that carries the day it
 * began makes that measurable without a second table.
 *
 * `skipPaths` is the other half of the same thought, and it was learned the
 * expensive way: with the stamp on every request, the Docker healthcheck on
 * /health created a session every fifteen seconds. That is 5,760 Redis keys a
 * day, each one alive for thirty days, for a caller that will never come back
 * with a cookie. The health endpoints are infrastructure; infrastructure does
 * not get user state.
 *
 * Skipping only means "do not create one here". A request that arrives with a
 * cookie is still read normally on these paths, so nothing is hidden from them.
 */
export function ensureSession(skipPaths: readonly string[] = []): RequestHandler {
  const skip = new Set(skipPaths);
  return (req, _res, next) => {
    if (!skip.has(req.path) && !req.session.createdAt) {
      req.session.createdAt = new Date().toISOString();
    }
    next();
  };
}

/**
 * The session id, and the one function the rest of the application uses.
 *
 * Every module is handed this rather than reading `req.session` itself, so
 * there is exactly one answer to "whose notebook is this" and no module has to
 * know that express-session exists.
 */
export function sessionIdOf(req: { session?: { id?: string } }): string | null {
  return req.session?.id ?? null;
}
