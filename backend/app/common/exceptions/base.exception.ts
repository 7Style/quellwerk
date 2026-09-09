export class BaseException extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly path?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    path?: string,
    errorCode?: string
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode || this.constructor.name.replace('Exception', '').toUpperCase();
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.path = path;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      timestamp: this.timestamp,
      path: this.path,
      stack: this.stack,
    };
  }
}

// Common HTTP exceptions
export class BadRequestException extends BaseException {
  constructor(message: string = 'Bad Request', path?: string) {
    super(message, 400, true, path);
  }
}

export class UnauthorizedException extends BaseException {
  constructor(message: string = 'Unauthorized', path?: string) {
    super(message, 401, true, path);
  }
}

export class ForbiddenException extends BaseException {
  constructor(message: string = 'Forbidden', path?: string) {
    super(message, 403, true, path);
  }
}

export class NotFoundException extends BaseException {
  constructor(message: string = 'Not Found', path?: string) {
    super(message, 404, true, path);
  }
}

export class ConflictException extends BaseException {
  constructor(message: string = 'Conflict', path?: string) {
    super(message, 409, true, path);
  }
}

export class ValidationException extends BaseException {
  public readonly errors: any[];

  constructor(errors: any[], message: string = 'Validation Failed', path?: string) {
    super(message, 422, true, path);
    this.errors = errors;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

export class TooManyRequestsException extends BaseException {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too Many Requests', retryAfter?: number, path?: string) {
    super(message, 429, true, path);
    this.retryAfter = retryAfter;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

export class InternalServerException extends BaseException {
  constructor(message: string = 'Internal Server Error', path?: string) {
    super(message, 500, false, path);
  }
}

export class ServiceUnavailableException extends BaseException {
  constructor(message: string = 'Service Unavailable', path?: string) {
    super(message, 503, false, path);
  }
}



