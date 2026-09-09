/**
 * Base exception class for all custom exceptions
 */
export abstract class BaseException extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert exception to JSON representation
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Validation exception for input validation errors
 */
export class ValidationException extends BaseException {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Not found exception
 */
export class NotFoundException extends BaseException {
  constructor(resource: string, id?: string | number) {
    const message = id 
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', { resource, id });
  }
}

/**
 * Conflict exception for duplicate resources
 */
export class ConflictException extends BaseException {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * Unauthorized exception
 */
export class UnauthorizedException extends BaseException {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden exception
 */
export class ForbiddenException extends BaseException {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Bad request exception
 */
export class BadRequestException extends BaseException {
  constructor(message: string, details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * Internal server error exception
 */
export class InternalServerErrorException extends BaseException {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

/**
 * Service unavailable exception
 */
export class ServiceUnavailableException extends BaseException {
  constructor(message: string = 'Service temporarily unavailable', details?: any) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

/**
 * Too many requests exception
 */
export class TooManyRequestsException extends BaseException {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'TOO_MANY_REQUESTS', { retryAfter });
  }
}
