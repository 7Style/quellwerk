/**
 * Global Express request augmentation (Express 5 / @types/express 5).
 * Must be a module (see the `export {}` at the end) so that the
 * `declare global` block merges with the ambient Express namespace.
 *
 * The template declared a `user` here with roles and permissions. There are no
 * accounts in Quellwerk (ADR-0005), so it is gone: a type that describes
 * nothing still gets read as if it described something. Who a request belongs
 * to is `req.session.id`, declared in express-session.d.ts.
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Set by the ingest route for the file it accepted. Multer puts the
       * upload on `req.file`; this is the id of the row that was written for
       * it, so the controller does not have to thread it through (M2-T1).
       */
      sourceId?: string;
    }
  }
}

export {};
