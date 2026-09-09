import winston, { type Logger, format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'node:fs';
import { loggerConfig } from '../../config/logger.config.js';

// Ensure log directories exist
const ensureLogDirectories = () => {
  const dirs = [
    loggerConfig.file.dirname,
    loggerConfig.errorFile.dirname,
    loggerConfig.audit.dirname,
  ];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

const SENSITIVE_KEYS = new Set(loggerConfig.excludeFields.map((field) => field.toLowerCase()));
const REDACTED = '[REDACTED]';
const MAX_SCRUB_DEPTH = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively replace values of sensitive keys (case-insensitive) with a
 * placeholder. Returns a copy; never mutates the input.
 */
export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > MAX_SCRUB_DEPTH) return value;

  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrubSensitive(item, depth + 1)) as T;
  }

  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrubSensitive(entry, depth + 1);
    }
    return copy as T;
  }

  return value;
}

// Custom format to exclude sensitive data (message + meta, nested objects included).
// The scrubbed string keys are written back onto the original `info`: winston
// routes entries by the Symbol(level)/Symbol(message) keys, and a spread copy
// would drop them, after which every transport silently discards the entry.
const excludeSensitiveData = format((info) => {
  const { level: _level, message: _message, ...rest } = info;
  return Object.assign(info, scrubSensitive(rest));
});

// Create logger instance
class LoggerService {
  private logger: Logger;
  private auditLogger: Logger;

  constructor() {
    ensureLogDirectories();

    // Main logger
    this.logger = winston.createLogger({
      level: loggerConfig.level,
      format: format.combine(
        format.timestamp({ format: loggerConfig.format.timestamp }),
        excludeSensitiveData(),
        format.errors({ stack: true }),
        loggerConfig.format.json ? format.json() : format.simple()
      ),
      defaultMeta: { service: 'bp-monolith' },
      transports: this.createTransports(),
    });

    // Audit logger (separate instance for audit logs)
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp({ format: loggerConfig.format.timestamp }),
        excludeSensitiveData(),
        format.json()
      ),
      defaultMeta: { service: 'bp-monolith-audit' },
      transports: [this.createAuditTransport()],
    });
  }

  private createTransports(): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport
    if (loggerConfig.console.enabled) {
      transports.push(
        new winston.transports.Console({
          format: format.combine(
            loggerConfig.console.colorize ? format.colorize() : format.uncolorize(),
            loggerConfig.console.prettyPrint
              ? format.printf(({ timestamp, level, message, ...meta }) => {
                  const metaStr = Object.keys(meta).length
                    ? `\n${JSON.stringify(meta, null, 2)}`
                    : '';
                  return `${String(timestamp)} [${level}]: ${String(message)}${metaStr}`;
                })
              : format.simple()
          ),
        })
      );
    }

    // File transport
    if (loggerConfig.file.enabled) {
      transports.push(
        new DailyRotateFile({
          dirname: loggerConfig.file.dirname,
          filename: loggerConfig.file.filename,
          datePattern: loggerConfig.file.datePattern,
          zippedArchive: loggerConfig.file.zippedArchive,
          maxSize: loggerConfig.file.maxSize,
          maxFiles: loggerConfig.file.maxFiles,
        })
      );
    }

    // Error file transport
    if (loggerConfig.errorFile.enabled) {
      transports.push(
        new DailyRotateFile({
          dirname: loggerConfig.errorFile.dirname,
          filename: loggerConfig.errorFile.filename,
          datePattern: loggerConfig.errorFile.datePattern,
          zippedArchive: loggerConfig.errorFile.zippedArchive,
          maxSize: loggerConfig.errorFile.maxSize,
          maxFiles: loggerConfig.errorFile.maxFiles,
          level: loggerConfig.errorFile.level,
        })
      );
    }

    return transports;
  }

  private createAuditTransport(): winston.transport {
    return new DailyRotateFile({
      dirname: loggerConfig.audit.dirname,
      filename: loggerConfig.audit.filename,
      datePattern: loggerConfig.audit.datePattern,
      zippedArchive: loggerConfig.audit.zippedArchive,
      maxSize: loggerConfig.audit.maxSize,
      maxFiles: loggerConfig.audit.maxFiles,
    });
  }

  // Main logging methods
  debug(message: string, meta?: unknown): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorMeta =
      error instanceof Error
        ? { error: { message: error.message, stack: error.stack, ...meta } }
        : { error, ...meta };

    this.logger.error(message, errorMeta);
  }

  // Audit logging
  audit(action: string, userId?: number, details?: unknown): void {
    this.auditLogger.info('Audit Log', {
      action,
      userId,
      timestamp: new Date().toISOString(),
      details,
    });
  }

  // HTTP request logging
  http(
    req: {
      path: string;
      method: string;
      originalUrl?: string;
      url?: string;
      ip?: string;
      socket?: { remoteAddress?: string };
      headers: Record<string, unknown>;
      user?: { id?: number };
      get(name: string): string | undefined;
    },
    res: { statusCode: number },
    responseTime: number
  ): void {
    // Skip excluded paths
    if (loggerConfig.http.excludePaths.some((path) => req.path === path)) {
      return;
    }

    const logData: Record<string, unknown> = {
      method: req.method,
      url: req.originalUrl ?? req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
    };

    // Add non-sensitive headers
    const headers: Record<string, unknown> = {};
    Object.keys(req.headers).forEach((key) => {
      if (!loggerConfig.http.excludeHeaders.includes(key.toLowerCase())) {
        headers[key] = req.headers[key];
      }
    });

    if (Object.keys(headers).length > 0) {
      logData['headers'] = headers;
    }

    // Log based on status code
    if (res.statusCode >= 500) {
      this.error(`HTTP ${req.method} ${req.path}`, undefined, logData);
    } else if (res.statusCode >= 400) {
      this.warn(`HTTP ${req.method} ${req.path}`, logData);
    } else {
      this.info(`HTTP ${req.method} ${req.path}`, logData);
    }
  }

  // Create child logger with additional context
  child(meta: Record<string, unknown>): LoggerService {
    const childService = Object.create(this) as LoggerService;
    childService.logger = this.logger.child(meta);
    return childService;
  }

  // Stream for Morgan
  get stream() {
    return {
      write: (message: string) => {
        this.info(message.trim());
      },
    };
  }
}

// Export singleton instance
export const logger = new LoggerService();

// Export for type usage
export type { LoggerService };
