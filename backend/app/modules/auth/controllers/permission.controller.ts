/**
 * Permission Controller
 * Handles session, permission and navigation endpoints
 * Part of the backend-driven authorization system
 */

import type { NextFunction, Request, Response } from 'express';
import { PermissionService, type FieldPermissionUpdate } from '../services/permission.service.js';
import { ValidationException } from '../internal/exceptions/base.exception.js';
import { ForbiddenException } from '../internal/exceptions/base.exception.js';

/**
 * DTOs für Permission Controller
 */
export interface VerifyAccessDto {
  resource: string;
  action?: string;
}

export class PermissionController {
  constructor(private permissionService: PermissionService) {}

  /**
   * Get current session with permissions
   * Endpoint: GET /api/auth/session
   * 
   * Returns complete user session including:
   * - User data
   * - Permissions (role, modules, actions, dataScopes)
   * - Navigation items
   */
  async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const session = await this.permissionService.getSessionWithPermissions(userId);

      res.json({
        success: true,
        data: session
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify access to a resource
   * Endpoint: POST /api/auth/verify-access
   * 
   * Body: {
   *   resource: "/clients",
   *   action: "view" // optional, default: "view"
   * }
   */
  async verifyAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const dto = (req.body ?? {}) as VerifyAccessDto;

      if (!dto.resource) {
        throw new ValidationException('Resource is required');
      }

      const result = await this.permissionService.verifyAccess(
        userId,
        dto.resource,
        dto.action || 'view'
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get navigation for current user
   * Endpoint: GET /api/auth/navigation
   * 
   * Returns navigation items based on user role
   */
  async getNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const navigation = await this.permissionService.getNavigationForUser(userId);

      res.json({
        success: true,
        data: navigation
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check specific permission
   * Endpoint: GET /api/auth/permissions/:permission
   * 
   * Example: GET /api/auth/permissions/users:create
   */
  async checkPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const permission = typeof req.params.permission === 'string' ? req.params.permission : '';

      if (!permission) {
        throw new ValidationException('Permission parameter is required');
      }

      const hasPermission = await this.permissionService.hasPermission(userId, permission);

      res.json({
        success: true,
        data: {
          permission,
          allowed: hasPermission
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user permissions
   * Endpoint: GET /api/auth/permissions
   * 
   * Returns all permissions for the current user
   */
  async getPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const session = await this.permissionService.getSessionWithPermissions(userId);

      res.json({
        success: true,
        data: session.permissions
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get field permissions
   * Endpoint: POST /api/auth/permissions/fields
   * 
   * Body: { resources: string[] }
   * Returns: { [resource: string]: FieldPermission }
   */
  async getFieldPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { resources } = (req.body ?? {}) as { resources?: unknown };

      if (!resources || !Array.isArray(resources)) {
        throw new ValidationException('Resources array is required');
      }

      const permissions = await this.permissionService.getFieldPermissions(userId, resources);
      
      // Convert Map to Object for JSON response
      const permissionsObject: Record<string, any> = {};
      permissions.forEach((value, key) => {
        permissionsObject[key] = value;
      });

      res.json({
        success: true,
        data: permissionsObject
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check field permission
   * Endpoint: POST /api/auth/permissions/check-field
   * 
   * Body: { resource: string, action: string }
   * Returns: { allowed: boolean }
   */
  async checkFieldPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { resource, action } = (req.body ?? {}) as { resource?: string; action?: string };

      if (!resource || !action) {
        throw new ValidationException('Resource and action are required');
      }

      if (!['show', 'read', 'write'].includes(action)) {
        throw new ValidationException('Action must be one of: show, read, write');
      }

      const allowed = await this.permissionService.checkFieldPermission(
        userId, 
        resource, 
        action as 'show' | 'read' | 'write'
      );

      res.json({
        success: true,
        data: { allowed }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get permissions by pattern
   * Endpoint: GET /api/auth/permissions/pattern/:pattern
   * 
   * Example: GET /api/auth/permissions/pattern/client:elster_form:*
   * Returns: FieldPermission[]
   */
  async getPermissionsByPattern(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const pattern = typeof req.params.pattern === 'string' ? req.params.pattern : '';

      if (!pattern) {
        throw new ValidationException('Pattern parameter is required');
      }

      const permissions = await this.permissionService.getResourcePermissions(userId, pattern);

      res.json({
        success: true,
        data: permissions
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update field permissions
   * Endpoint: PUT /api/auth/permissions/fields
   * 
   * Body: FieldPermissionUpdate
   * Returns: { success: boolean }
   * 
   * Requires admin permissions
   */
  async updateFieldPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const update = (req.body ?? {}) as FieldPermissionUpdate;

      // Check if user has admin permissions
      const hasAdminPermission = await this.permissionService.hasPermission(userId, 'permissions:write');
      if (!hasAdminPermission) {
        throw new ForbiddenException('Insufficient permissions to update field permissions');
      }

      await this.permissionService.updateFieldPermissions(update);

      res.json({
        success: true,
        message: 'Field permissions updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}
