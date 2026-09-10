/**
 * Anonymous session (ADR-0005). A signed cookie backed by a Redis store, thirty
 * days, no accounts. Every notebook query is scoped to the session; a notebook
 * that belongs to someone else answers 404 and not 403, so a guessed id is
 * never confirmed.
 *
 * The demo notebook is the one exception: readable by everyone, and the first
 * write copies it into the caller's own session (copy-on-first-write, M7-T1).
 * Implementation arrives in M2-T0.
 */
import type { Express } from 'express';

export interface SessionModuleDeps {
  sessionSecret: string;
  cookieName: string;
  maxAgeMs: number;
  isProduction: boolean;
}

export function initSessionModule(_app: Express, _deps: SessionModuleDeps): void {
  // M2-T0: express-session with a Redis store, httpOnly, sameSite lax,
  // secure behind the proxy.
}
