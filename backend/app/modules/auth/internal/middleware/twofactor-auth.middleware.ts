import { Request, Response, NextFunction } from 'express';
import { TokenUtil } from '../utils/token.util.js';
import { UnauthorizedException } from '../exceptions/base.exception.js';

/**
 * Middleware that accepts either a normal access token or a temporary 2FA token.
 * Use ONLY on read-only endpoints that are safe to access pre-login (2FA status).
 * Never guard /2fa/setup or /2fa/verify-setup with it: the temporary token
 * proves the password only, not the second factor.
 */
export async function twoFactorStatusAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const token = parts[1];

    // Try access token first
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
      return next();
    } catch {
      // Fall through to temp token check
    }

    // Try temp 2FA token
    try {
      const decoded = await TokenUtil.verifyTempToken(token);
      req.user = {
        id: parseInt(decoded.sub || '0', 10),
        email: decoded.email || '',
        roles: [],
        permissions: [],
      };
      req.token = token;
      return next();
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  } catch (error) {
    next(error);
  }
}

