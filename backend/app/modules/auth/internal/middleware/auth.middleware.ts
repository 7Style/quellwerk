import { Request, Response, NextFunction } from 'express';
import { TokenUtil } from '../utils/token.util.js';
import { UnauthorizedException } from '../exceptions/base.exception.js';
import { logger } from '../utils/logger.util.js';

// User interface is defined in app/types/express.d.ts

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedException('No authorization header');
    }

    // Check Bearer format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const token = parts[1];

    // Verify token
    try {
      const decoded = await TokenUtil.verifyAccessToken(token);
      
      // Attach user and token to request
      req.user = {
        id: parseInt(decoded.sub || '0', 10),
        email: decoded.email || '',
        roles: (decoded.roles || []).map((role: string) => ({ id: 0, code: role })),
        permissions: decoded.permissions || [],
        sessionId: decoded.sessionId,
      };
      req.token = token;

      logger.debug('User authenticated', { userId: req.user?.id });
      next();
    } catch (error) {
      logger.debug('Token verification failed', { error });
      throw new UnauthorizedException('Invalid or expired token');
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];

    try {
      const decoded = await TokenUtil.verifyAccessToken(token);
      
      req.user = {
        id: parseInt(decoded.sub || '0', 10),
        email: decoded.email || '',
        roles: (decoded.roles || []).map((role: string) => ({ id: 0, code: role })),
        permissions: decoded.permissions || [],
        sessionId: decoded.sessionId,
      };
      req.token = token;
    } catch {
      // Ignore invalid tokens for optional auth
    }

    next();
  } catch (error) {
    next(error);
  }
}
