/**
 * Prisma 7 client barrel.
 *
 * - Builds the application-wide PrismaClient singleton on top of the pg driver
 *   adapter (Prisma 7 has no built-in engine anymore).
 * - Re-exports everything from the generated client so application code never
 *   imports `../generated/prisma/...` directly.
 * - Applies the global `omit` for sensitive columns (prisma-omit.ts); the
 *   exported `PrismaClient` type is the omit-aware client, so reading
 *   `user.password` from a plain query is a compile error.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as GeneratedPrismaClient, type Prisma } from '../generated/prisma/client.js';
import { databaseConfig } from '../config/database.config.js';
import { appConfig } from '../config/app.config.js';
import { logger } from '../common/utils/logger.util.js';
import { sensitiveColumns } from './prisma-omit.js';

export * from '../generated/prisma/client.js';
export { sensitiveColumns } from './prisma-omit.js';

/** Application client: generated client with the global omit applied */
export type PrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  // Cached across hot reloads; `var` is required for global declarations
  var __prisma__: PrismaClient | undefined;
}

const logDefinitions = (
  appConfig.app.isProduction
    ? [
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ]
    : [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ]
) satisfies Prisma.LogDefinition[];

export function createPrismaClient(connectionString: string = databaseConfig.url) {
  const adapter = new PrismaPg({
    connectionString,
    max: databaseConfig.pool.max,
    connectionTimeoutMillis: databaseConfig.pool.connectionTimeoutMillis,
    idleTimeoutMillis: databaseConfig.pool.idleTimeoutMillis,
  });

  const client = new GeneratedPrismaClient({
    adapter,
    log: logDefinitions,
    omit: sensitiveColumns,
  });

  client.$on('error', (event: Prisma.LogEvent) => {
    logger.error('Prisma error', undefined, { message: event.message, target: event.target });
  });

  client.$on('warn', (event: Prisma.LogEvent) => {
    logger.warn('Prisma warning', { message: event.message, target: event.target });
  });

  if (!appConfig.app.isProduction) {
    client.$on('query', (event: Prisma.QueryEvent) => {
      logger.debug(`Query: ${event.query}`, { duration: event.duration });
    });
  }

  return client;
}

export function getPrismaClient(): PrismaClient {
  if (!globalThis.__prisma__) {
    globalThis.__prisma__ = createPrismaClient();
  }
  return globalThis.__prisma__;
}

export const prisma = getPrismaClient();
