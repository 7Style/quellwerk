/**
 * Audit-Logs Routes
 * Routes für Audit-Logs API-Endpoints
 */

import { Router, type RequestHandler } from 'express';
import { AuditLogsController } from '../controllers/audit-logs.controller.js';
import { AuditLogsApiService } from '../services/audit-logs-api.service.js';

/**
 * Create audit-logs routes
 */
export function createAuditLogsRoutes(middlewares: RequestHandler[] = []): Router {
  const router = Router();

  // Apply injected middlewares (e.g., auth) from outside (DI), not imported here
  middlewares.forEach((mw) => router.use(mw));

  // Initialize service and controller
  const auditLogsService = new AuditLogsApiService();
  const c = new AuditLogsController(auditLogsService);

  // Routes (Express 5 forwards rejected promises to the error middleware)
  router.get('/', (req, res) => c.getAuditLogs(req, res));
  router.get('/statistics', (req, res) => c.getStatistics(req, res));
  router.get('/export', (req, res) => c.exportAuditLogs(req, res));
  router.get('/:id', (req, res) => c.getAuditLogById(req, res));

  return router;
}
