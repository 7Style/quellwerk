/**
 * The module's own errors, shaped so the global error middleware recognises
 * them by duck typing (statusCode plus errorCode) without this module
 * importing anything from a shared area.
 */
import type { CapacityRefusal } from './capacity.js';

export class CapacityExceededError extends Error {
  readonly statusCode = 413;
  readonly errorCode = 'CAPACITY_EXCEEDED';
  readonly details: { reason: string; limit: number; current: number };

  constructor(refusal: CapacityRefusal) {
    // 413 and not 400: the request was well formed. What was wrong was its
    // size, and the UI shows a different message for the two.
    super(refusal.message);
    this.name = 'CapacityExceededError';
    this.details = { reason: refusal.reason, limit: refusal.limit, current: refusal.current };
  }
}

export class UnsupportedSourceError extends Error {
  readonly statusCode = 415;
  readonly errorCode = 'UNSUPPORTED_SOURCE';

  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSourceError';
  }
}

export class EmptySourceError extends Error {
  readonly statusCode = 422;
  readonly errorCode = 'EMPTY_SOURCE';

  constructor() {
    super('There is no text in that source.');
    this.name = 'EmptySourceError';
  }
}
