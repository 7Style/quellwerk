/**
 * Permission Routes
 * Routes for session, permissions and navigation endpoints
 * Part of the backend-driven authorization system
 */

import { Router, type RequestHandler } from 'express';
import { PermissionController } from '../controllers/permission.controller.js';

export function createPermissionRoutes(
  controller: PermissionController,
  authenticateMiddleware: RequestHandler
): Router {
  const router = Router();

  /**
   * All permission routes require authentication
   */
  router.use(authenticateMiddleware);

  /**
   * GET /api/auth/session
   * Get current session with permissions and navigation
   */
  router.get('/session', (req, res, next) => controller.getSession(req, res, next));

  /**
   * POST /api/auth/verify-access
   * Verify access to a specific resource
   * Body: { resource: string, action?: string }
   */
  router.post('/verify-access', (req, res, next) => controller.verifyAccess(req, res, next));

  /**
   * GET /api/auth/navigation
   * Get navigation items for current user
   */
  router.get('/navigation', (req, res, next) => controller.getNavigation(req, res, next));

  /**
   * GET /api/auth/permissions
   * Get all permissions for current user
   */
  router.get('/permissions', (req, res, next) => controller.getPermissions(req, res, next));

  /**
   * GET /api/auth/permissions/:permission
   * Check if user has specific permission
   */
  router.get('/permissions/:permission', (req, res, next) =>
    controller.checkPermission(req, res, next)
  );

  /**
   * POST /api/auth/permissions/fields
   * Get field permissions for multiple resources
   * Body: { resources: string[] }
   */
  router.post('/permissions/fields', (req, res, next) =>
    controller.getFieldPermissions(req, res, next)
  );

  /**
   * POST /api/auth/permissions/check-field
   * Check single field permission
   * Body: { resource: string, action: string }
   */
  router.post('/permissions/check-field', (req, res, next) =>
    controller.checkFieldPermission(req, res, next)
  );

  /**
   * GET /api/auth/permissions/pattern/:pattern
   * Get permissions by resource pattern
   * Example: /api/auth/permissions/pattern/client:elster_form:*
   */
  router.get('/permissions/pattern/:pattern', (req, res, next) =>
    controller.getPermissionsByPattern(req, res, next)
  );

  /**
   * PUT /api/auth/permissions/fields
   * Update field permissions (admin only)
   * Body: FieldPermissionUpdate
   */
  router.put('/permissions/fields', (req, res, next) =>
    controller.updateFieldPermissions(req, res, next)
  );

  return router;
}
