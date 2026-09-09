/**
 * Audit-Logs Module
 * Module für REST-API-Endpoints zum Abrufen von Audit-Logs
 */

import type { Express, RequestHandler } from 'express';
import type { PrismaClient } from '../../lib/prisma.js';
import { createAuditLogsRoutes } from './routes/audit-logs.routes.js';
import { initAuditLogsServices } from './services/base.service.js';
import type { LoggerLike } from '../audit/interfaces/audit.interface.js';

export interface AuditLogsModuleConfig {
  prismaClient: PrismaClient;
  logger: LoggerLike;
  authenticateMiddleware?: RequestHandler;
  roleGuardMiddleware?: RequestHandler; // Role guard (SUPER_ADMIN)
  rateLimitMiddleware?: RequestHandler; // Per-user API limiter (after auth)
  basePath?: string;
}

/**
 * Initialize and mount audit-logs module
 */
export function initAuditLogsModule(
  app: Express,
  config: AuditLogsModuleConfig
): void {
  // Initialize services with dependencies
  initAuditLogsServices({
    prisma: config.prismaClient,
    logger: config.logger,
  });

  // Prepare middlewares
  const middlewares: RequestHandler[] = [];
  if (config.authenticateMiddleware) {
    middlewares.push(config.authenticateMiddleware);
  }
  // 🔒 Role-Guard NACH Auth-Middleware (User muss erst authentifiziert sein)
  if (config.roleGuardMiddleware) {
    middlewares.push(config.roleGuardMiddleware);
  }
  if (config.rateLimitMiddleware) {
    middlewares.push(config.rateLimitMiddleware);
  }

  // Create and mount routes
  const router = createAuditLogsRoutes(middlewares);
  const basePath = config.basePath || '/api/audit-logs';
  app.use(basePath, router);

  config.logger.info('[AuditLogs] Module initialized', {
    basePath,
    hasAuth: !!config.authenticateMiddleware,
    hasRoleGuard: !!config.roleGuardMiddleware,
  });
}

