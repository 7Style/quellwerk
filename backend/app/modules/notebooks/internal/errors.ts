/**
 * The module's own errors.
 *
 * They carry `statusCode` and `errorCode` and are otherwise plain: the global
 * error middleware recognises that shape by duck typing, which is what lets a
 * module report an HTTP status without importing anything from a shared area
 * (CLAUDE.md, module rules).
 */

export class NotebookNotFoundError extends Error {
  readonly statusCode = 404;
  readonly errorCode = 'NOTEBOOK_NOT_FOUND';

  constructor() {
    // 404 and not 403, deliberately. A 403 would confirm that the id exists and
    // belongs to somebody, which turns a guessed id into information
    // (SECURITY.md 7.2). The message says the same thing for both cases.
    super('No such notebook.');
    this.name = 'NotebookNotFoundError';
  }
}

export class NoSessionError extends Error {
  readonly statusCode = 400;
  readonly errorCode = 'NO_SESSION';

  constructor() {
    super('No session. Enable cookies and reload.');
    this.name = 'NoSessionError';
  }
}
