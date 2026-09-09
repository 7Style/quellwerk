import { env } from './env.config.js';
import { appConfig } from './app.config.js';
import { authConfig } from './auth.config.js';
import { databaseConfig } from './database.config.js';
import { redisConfig } from './redis.config.js';
import { loggerConfig } from './logger.config.js';
import { corsConfig, corsOptionsDelegate } from './cors.config.js';
import { rateLimitConfig } from './rate-limit.config.js';
import { emailConfig } from '../services/email/index.js';

// Environment variables are validated once in env.config.ts (zod). Importing
// it here guarantees the process fails fast when a required variable is missing.

export const config = {
  // App configuration (env, port, etc.)
  ...appConfig.app,

  // Module configurations
  env: env.NODE_ENV,
  app: appConfig,
  auth: authConfig,
  database: databaseConfig,
  redis: redisConfig,
  logger: loggerConfig,
  cors: corsConfig,
  corsDelegate: corsOptionsDelegate,
  rateLimit: rateLimitConfig,
  email: emailConfig,

  // Features from app config
  ...appConfig.features,
};

export { env };
export default config;
