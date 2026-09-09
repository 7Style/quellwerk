import { env } from './env.config.js';
import { appConfig } from './app.config.js';

export const databaseConfig = {
  url: env.DATABASE_URL,

  // pg pool settings used by the Prisma driver adapter (see app/lib/prisma.ts)
  pool: {
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  },

  // Enable query logging in development
  logging: appConfig.app.isDevelopment,
};
