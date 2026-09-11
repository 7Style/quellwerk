import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { z } from 'zod';
import { BaseException } from '../exceptions/base.exception.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../../config/index.js';

interface ModuleException {
  statusCode: number;
  errorCode?: string;
  code?: string;
  /** http-errors puts its machine-readable reason here (`entity.too.large`). */
  type?: string;
  details?: unknown;
}

/**
 * Recognises a module's own error by its shape, so a module can report an HTTP
 * status without importing anything from a shared area (CLAUDE.md).
 *
 * `errorCode` OR `code` OR `type`: the third is what http-errors uses, and
 * without it the errors from `express.json` fell through to the default branch.
 * A body over the 2 MB limit was answered as a 500 with a full stack trace in
 * the log, where the honest answer is 413.
 */
function isModuleException(error: unknown): error is Error & ModuleException {
  if (!(error instanceof Error)) return false;
  const candidate = error as Partial<ModuleException> & { type?: string };
  return (
    typeof candidate.statusCode === 'number' &&
    (typeof candidate.errorCode === 'string' ||
      typeof candidate.code === 'string' ||
      typeof candidate.type === 'string')
  );
}

interface PrismaKnownError extends Error {
  code: string;
}

function isPrismaKnownRequestError(error: Error): error is PrismaKnownError {
  return error.name === 'PrismaClientKnownRequestError' && typeof (error as Partial<PrismaKnownError>).code === 'string';
}

/**
 * Global error handler middleware (must stay 4-ary for Express)
 */
export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const timestamp = config.isProduction ? {} : { timestamp: new Date() };

  // Validation errors (zod) -> 400 with field details
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        statusCode: 400,
        details: z.flattenError(error).fieldErrors,
        ...timestamp,
      },
    });
    return;
  }

  // Multipart/upload errors. A file over the limit is 413 and not 400: the
  // request was well formed, it was too big, and the UI shows a different
  // message for the two (docs/SPEC.md, "Zahlen"). Everything else multer
  // reports is a malformed request.
  if (error instanceof MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    const statusCode = tooLarge ? 413 : 400;
    res.status(statusCode).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        message: tooLarge
          ? `That file is larger than ${Math.round(config.upload.maxFileSize / (1024 * 1024))} MB.`
          : error.message,
        statusCode,
        details: { field: error.field, multerCode: error.code },
        ...timestamp,
      },
    });
    return;
  }

  // A refused request is not a failure of the server. A 404 for a notebook that
  // is not yours and a 413 for a notebook that is full are the application
  // working, and writing a stack trace for each one buries the 500 that
  // actually needs reading. So: 5xx with the error and its stack, 4xx as one
  // warning line with the code and nothing else.
  const status =
    error instanceof BaseException || isModuleException(error) ? error.statusCode : 500;
  const where = { method: req.method, url: req.originalUrl, ip: req.ip };

  if (status >= 500) {
    logger.error('Request error:', error, { ...where, userAgent: req.get('user-agent') });
  } else {
    logger.warn('Request refused', {
      ...where,
      status,
      code: error instanceof BaseException ? error.errorCode : error.name,
    });
  }

  // Normalize module and app exceptions into a consistent ErrorResponseDto
  if (error instanceof BaseException || isModuleException(error)) {
    const statusCode = error.statusCode;
    const errorCode =
      error instanceof BaseException
        ? error.errorCode
        : (error.errorCode ?? error.code ?? error.type);

    const responseError: Record<string, unknown> = {
      code: errorCode,
      message: error.message || 'Error',
      statusCode,
    };

    // Include details for Auth exceptions
    if ('details' in error && error.details !== undefined) {
      responseError.details = error.details;
    }

    res.status(statusCode).json({ error: { ...responseError, ...timestamp } });
    return;
  }

  // Handle Prisma errors
  if (isPrismaKnownRequestError(error)) {
    // Unique constraint violation
    if (error.code === 'P2002') {
      res.status(409).json({
        error: { code: 'RESOURCE_EXISTS', message: 'Resource already exists', statusCode: 409 },
      });
      return;
    }

    // Foreign key constraint violation
    if (error.code === 'P2003') {
      res.status(400).json({
        error: { code: 'INVALID_REFERENCE', message: 'Invalid reference', statusCode: 400 },
      });
      return;
    }

    // Record not found
    if (error.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Resource not found', statusCode: 404 },
      });
      return;
    }
  }

  // Default error response
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.isProduction ? 'Internal server error' : error.message || 'Internal server error',
      statusCode: 500,
      ...timestamp,
    },
  });
};

/**
 * 404 handler
 */
export const notFoundMiddleware = (req: Request, res: Response, _next: NextFunction): void => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.path,
  });
};
