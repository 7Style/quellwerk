/**
 * Role Guard Middleware
 * Prüft ob der User die erforderliche Rolle hat
 * 
 * SICHERHEIT: Die Rolle kommt aus dem JWT Token, NICHT aus dem Frontend!
 * Der Token wird vom Backend signiert und kann nicht manipuliert werden.
 */

import { Request, Response, NextFunction } from 'express';
import { UserRoleEnum, ROLE_PRIORITY } from '../enums/user-role.enum.js';
import { logger } from '../utils/logger.util.js';

/**
 * Prüft ob User eine der erlaubten Rollen hat
 */
export function requireRoles(allowedRoles: UserRoleEnum[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        logger.warn('[RoleGuard] No user in request - not authenticated');
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const userRoles = req.user.roles || [];
      const userRoleCodes = userRoles.map((r: { code: string }) => r.code);

      const hasRequiredRole = allowedRoles.some(role => 
        userRoleCodes.includes(role)
      );

      if (!hasRequiredRole) {
        logger.warn('[RoleGuard] Access denied', {
          userId: req.user.id,
          userRoles: userRoleCodes,
          requiredRoles: allowedRoles,
          path: req.path,
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            requiredRoles: allowedRoles,
            userRoles: userRoleCodes,
          },
        });
        return;
      }

      logger.debug('[RoleGuard] Access granted', {
        userId: req.user.id,
        role: userRoleCodes[0],
        path: req.path,
      });

      next();
    } catch (error) {
      logger.error('[RoleGuard] Error checking roles', { error });
      next(error);
    }
  };
}

/**
 * Prüft ob User mindestens die angegebene Rolle hat (hierarchisch)
 */
export function requireMinRole(minRole: UserRoleEnum) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const userRoles = req.user.roles || [];
      const userRoleCodes = userRoles.map((r: { code: string }) => r.code);

      const minRoleIndex = ROLE_PRIORITY.indexOf(minRole);
      
      const hasMinRole = userRoleCodes.some((roleCode: string) => {
        const roleIndex = ROLE_PRIORITY.indexOf(roleCode as UserRoleEnum);
        return roleIndex !== -1 && roleIndex <= minRoleIndex;
      });

      if (!hasMinRole) {
        logger.warn('[RoleGuard] Insufficient role level', {
          userId: req.user.id,
          userRoles: userRoleCodes,
          requiredMinRole: minRole,
          path: req.path,
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient role level',
            requiredMinRole: minRole,
          },
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireSuperAdmin = () => requireRoles([UserRoleEnum.SUPER_ADMIN]);

export const requirePlatformAccess = () => requireRoles([
  UserRoleEnum.SUPER_ADMIN,
  UserRoleEnum.PLATFORM_MANAGER,
]);

export const requireConsultantAccess = () => requireRoles([
  UserRoleEnum.SUPER_ADMIN,
  UserRoleEnum.PLATFORM_MANAGER,
  UserRoleEnum.CONSULTANT,
]);
