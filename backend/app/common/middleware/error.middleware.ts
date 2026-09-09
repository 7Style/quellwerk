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
  details?: unknown;
}

function isModuleException(error: unknown): error is Error & ModuleException {
  if (!(error instanceof Error)) return false;
  const candidate = error as Partial<ModuleException>;
  return (
    typeof candidate.statusCode === 'number' &&
    (typeof candidate.errorCode === 'string' || typeof candidate.code === 'string')
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

  // Multipart/upload errors -> 400
  if (error instanceof MulterError) {
    res.status(400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: error.message,
        statusCode: 400,
        details: { field: error.field, multerCode: error.code },
        ...timestamp,
      },
    });
    return;
  }

  // Log the error
  logger.error('Request error:', error, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Normalize module and app exceptions into a consistent ErrorResponseDto
  if (error instanceof BaseException || isModuleException(error)) {
    const statusCode = error.statusCode;
    const errorCode =
      error instanceof BaseException ? error.errorCode : (error.errorCode ?? error.code);

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
