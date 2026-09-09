import path from 'node:path';
import { env } from './env.config.js';
import { appConfig } from './app.config.js';

export const loggerConfig = {
  level: env.LOG_LEVEL,

  // Console logging
  console: {
    enabled: true,
    colorize: !appConfig.app.isProduction,
    timestamp: true,
    prettyPrint: appConfig.app.isDevelopment,
  },

  // File logging
  file: {
    enabled: appConfig.app.isProduction,
    dirname: path.join(process.cwd(), 'logs'),
    filename: 'app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: env.LOG_FILE_MAX_SIZE,
    maxFiles: env.LOG_FILE_MAX_FILES,
    zippedArchive: true,
  },

  // Error file logging
  errorFile: {
    enabled: true,
    dirname: path.join(process.cwd(), 'logs'),
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    zippedArchive: true,
  },

  // Audit logging
  audit: {
    enabled: true,
    dirname: path.join(process.cwd(), 'logs', 'audit'),
    filename: 'audit-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '365d',
    zippedArchive: true,
  },

  // Log formats
  format: {
    timestamp: 'YYYY-MM-DD HH:mm:ss',
    json: appConfig.app.isProduction,
  },

  // Sensitive data to exclude from logs (matched case-insensitively)
  excludeFields: [
    'authorization',
    'cookie',
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'token',
    'accessToken',
    'refreshToken',
    'tempToken',
    'secret',
    'apiKey',
    'creditCard',
  ],

  // HTTP request logging
  http: {
    enabled: true,
    excludePaths: ['/health', '/metrics', '/favicon.ico'],
    excludeHeaders: ['authorization', 'cookie'],
  },
};
