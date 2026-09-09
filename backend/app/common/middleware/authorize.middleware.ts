import { Request, Response, NextFunction } from 'express';
import { ForbiddenException } from '../exceptions/index.js';
import { logger } from '../utils/logger.util.js';

/**
 * Authorization middleware to check if user has required permission
 * @param permission Required permission string (e.g., 'user:read', 'user:create')
 */
export function authorize(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new ForbiddenException('Zugriff verweigert: Nicht authentifiziert');
      }

      // Check if user has the required permission or wildcard
      const hasWildcard = req.user.permissions?.includes('*');
      const hasPermission = hasWildcard || req.user.permissions?.includes(permission);

      // Level-gated and scrubbed winston output; no e-mail address and no
      // permission dump per request (console.log bypassed both).
      if (!hasPermission) {
        logger.debug('[Authorization] denied', {
          requiredPermission: permission,
          userId: req.user.id,
          roles: req.user.roles?.map((role) => role.code),
        });
        throw new ForbiddenException(`Zugriff verweigert: Berechtigung '${permission}' erforderlich`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has any of the specified permissions
 */
export function authorizeAny(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new ForbiddenException('Zugriff verweigert: Nicht authentifiziert');
      }

      // Check if user has any of the required permissions or wildcard
      const hasWildcard = req.user.permissions?.includes('*');
      const hasPermission = hasWildcard || permissions.some(permission => 
        req.user?.permissions?.includes(permission)
      );

      if (!hasPermission) {
        throw new ForbiddenException(`Zugriff verweigert: Eine der folgenden Berechtigungen erforderlich: ${permissions.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has all of the specified permissions
 */
export function authorizeAll(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new ForbiddenException('Zugriff verweigert: Nicht authentifiziert');
      }

      // Check if user has all of the required permissions or wildcard
      const hasWildcard = req.user.permissions?.includes('*');
      const hasAllPermissions = hasWildcard || permissions.every(permission => 
        req.user?.permissions?.includes(permission)
      );

      if (!hasAllPermissions) {
        throw new ForbiddenException(`Zugriff verweigert: Alle folgenden Berechtigungen erforderlich: ${permissions.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has a specific role
 */
export function requireRole(roleName: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new ForbiddenException('Zugriff verweigert: Nicht authentifiziert');
      }

    // Check if user has the required role
    const hasRole = req.user.roles?.some((role: { code: string }) => role.code === roleName);

      if (!hasRole) {
        throw new ForbiddenException(`Zugriff verweigert: Rolle '${roleName}' erforderlich`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
