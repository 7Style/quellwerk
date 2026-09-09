/**
 * Logger utility for the Auth Module
 *
 * A minimal console logger used as fallback until the host application
 * injects its own logger through `setLogger()` (AuthModule does this with the
 * logger from its configuration). The log level is configured explicitly,
 * this module does not read environment variables.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

class ConsoleLogger implements Logger {
  constructor(private logLevel: LogLevel = 'info') {}

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [AUTH-MODULE] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      if (context?.error instanceof Error) {
        console.error(
          this.formatMessage('error', message, {
            ...context,
            error: {
              message: context.error.message,
              stack: context.error.stack,
              name: context.error.name,
            },
          })
        );
      } else {
        console.error(this.formatMessage('error', message, context));
      }
    }
  }
}

const consoleLogger = new ConsoleLogger();
let customLogger: Logger | null = null;

/**
 * Replace the default logger with a custom implementation (host application logger)
 */
export function setLogger(newLogger: Logger | null): void {
  customLogger = newLogger;
}

/**
 * Set the level of the fallback console logger
 */
export function setConsoleLogLevel(level: LogLevel): void {
  consoleLogger.setLevel(level);
}

/**
 * Module logger: proxies to the injected logger when one is set,
 * otherwise to the console logger.
 */
export const logger: Logger = {
  debug: (message, context) => (customLogger ?? consoleLogger).debug(message, context),
  info: (message, context) => (customLogger ?? consoleLogger).info(message, context),
  warn: (message, context) => (customLogger ?? consoleLogger).warn(message, context),
  error: (message, context) => (customLogger ?? consoleLogger).error(message, context),
};

export default logger;
