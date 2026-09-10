import { env } from './env.config.js';

export const appConfig = {
  name: env.APP_NAME,
  description: env.APP_DESCRIPTION,
  version: process.env.npm_package_version ?? '0.2.0',

  api: {
    prefix: '/api',
    version: 'v1',
  },

  app: {
    port: env.PORT,
    host: env.HOST,
    trustProxy: env.TRUST_PROXY,
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },

  urls: {
    api: env.API_URL,
    frontend: env.FRONTEND_URL,
    /** Public base URL used for upload links (defaults to the API URL) */
    base: env.BASE_URL ?? env.API_URL,
  },

  features: {
    upload: {
      dir: env.UPLOAD_DIR,
      maxFileSize: env.UPLOAD_MAX_FILE_SIZE,
      allowedTypes: env.UPLOAD_ALLOWED_TYPES.split(',')
        .map((type) => type.trim())
        .filter(Boolean),
    },
    security: {
      helmetCspEnabled: env.HELMET_CSP_ENABLED,
      compressionEnabled: env.COMPRESSION_ENABLED,
    },
    retention: {
      days: env.RETENTION_DAYS,
    },
  },
};
