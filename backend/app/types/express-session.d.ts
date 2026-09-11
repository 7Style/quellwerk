/**
 * What Quellwerk keeps in the anonymous session (ADR-0005).
 *
 * Almost nothing, on purpose. Ownership of a notebook is `req.session.id`
 * against `Notebook.sessionId`, so the session itself does not have to carry a
 * list of anything, and a stolen cookie reveals no more than the notebooks it
 * already had.
 *
 * This file only declares types. It has to be inside the `include` of
 * tsconfig.json for the merge to happen at all, which app/**\/* covers.
 */
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /**
     * ISO timestamp, written once by `ensureSession`. Its real job is to give a
     * fresh session something to hold: with `saveUninitialized: false` an empty
     * session is never stored and the cookie never goes out.
     */
    createdAt?: string;
  }
}
