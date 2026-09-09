import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';
import { ForbiddenException } from '../exceptions/base.exception.js';
import { logger } from '../utils/logger.util.js';

/**
 * Middleware to check if user has required permission
 */
export const requirePermission = (permission: string) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenException('Authentication required'));
    }

    const hasWildcard = req.user.permissions.includes('*');
    const hasPermission = hasWildcard || req.user.permissions.includes(permission);

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        required: permission,
        userPermissions: req.user.permissions,
      });
      return next(
        new ForbiddenException(`Permission '${permission}' is required`)
      );
    }

    logger.debug('Permission granted', {
      userId: req.user.id,
      permission,
    });

    next();
  };
};

/**
 * Middleware to check if user has any of the required permissions
 */
export const requireAnyPermission = (permissions: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenException('Authentication required'));
    }

    const hasWildcard = req.user.permissions.includes('*');
    const hasPermission = hasWildcard || permissions.some(p => 
      req.user!.permissions.includes(p)
    );

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        required: permissions,
        userPermissions: req.user.permissions,
      });
      return next(
        new ForbiddenException(
          `One of these permissions is required: ${permissions.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * Middleware to check if user has all required permissions
 */
export const requireAllPermissions = (permissions: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenException('Authentication required'));
    }

    const hasWildcard = req.user.permissions.includes('*');
    const hasAllPermissions = hasWildcard || permissions.every(p => 
      req.user!.permissions.includes(p)
    );

    if (!hasAllPermissions) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        required: permissions,
        userPermissions: req.user.permissions,
      });
      return next(
        new ForbiddenException(
          `All of these permissions are required: ${permissions.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (role: string) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenException('Authentication required'));
    }

    const hasRole = req.user.roles.some(r => r.code === role);

    if (!hasRole) {
      logger.warn('Role denied', {
        userId: req.user.id,
        required: role,
        userRoles: req.user.roles,
      });
      return next(new ForbiddenException(`Role '${role}' is required`));
    }

    next();
  };
};

/**
 * Middleware to check if user has any of the required roles
 */
export const requireAnyRole = (roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenException('Authentication required'));
    }

    const hasRole = roles.some(role => req.user!.roles.some(r => r.code === role));

    if (!hasRole) {
      logger.warn('Role denied', {
        userId: req.user.id,
        required: roles,
        userRoles: req.user.roles,
      });
      return next(
        new ForbiddenException(
          `One of these roles is required: ${roles.join(', ')}`
        )
      );
    }

    next();
  };
};



