import { TokenUtil, CryptoUtil } from '../internal/index.js';
import { BaseAuthService } from './base.service.js';
import type { DecodedToken } from '../internal/utils/token.util.js';

export interface TokenPayload {
  id: number;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

export interface UserWithRolesAndPermissions {
  id: number;
  email: string;
  userRoles: Array<{
    role: {
      id: number;
      name: string;
      code?: string;
      rolePermissions: Array<{
        permission: {
          id: number;
          resource: string;
          action: string;
          module?: string;
        };
      }>;
    };
  }>;
}

export class TokenService extends BaseAuthService {
  constructor() {
    super();
    // config ist jetzt über this.config verfügbar
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(
    user: UserWithRolesAndPermissions, 
    sessionId: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Use role codes instead of names for security
      const roles = user.userRoles.map(ur => ur.role.code);
      const permissions = this.extractPermissions(user.userRoles);

      // Generate access token
      const accessToken = await TokenUtil.generateAccessToken({
        sub: user.id.toString(),
        email: user.email,
        roles,
        permissions,
        sessionId,
      });

      // Generate refresh token
      const refreshToken = await TokenUtil.generateRefreshToken(user.id, sessionId);

      this.logger.debug('Generated token pair', { userId: user.id, sessionId });

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      this.logger.error('Failed to generate token pair', { error, userId: user.id });
      throw error;
    }
  }

  /**
   * Verify temporary 2FA token and return payload
   */
  async verifyTempToken(token: string): Promise<{ userId: number }> {
    try {
      // Same secret, issuer and audience as every other module token
      const decoded = await TokenUtil.verifyTempToken(token);

      if (decoded.sub) {
        const userId = Number.parseInt(decoded.sub, 10);
        if (!Number.isNaN(userId)) {
          return { userId };
        }
      }

      throw new Error('Invalid temporary token');
    } catch (error) {
       this.logger.error('Failed to verify temp token', { error });
      throw error;
    }
  }

  /**
   * Generate temporary token for 2FA flow
   */
  async generateTempToken(userId: number): Promise<string> {
    try {
      // Temporary token (5 minutes) signed like every other module token
      const tempToken = await TokenUtil.generateTempToken(userId);

      this.logger.debug('Generated temp token for 2FA', { userId });
      return tempToken;
    } catch (error) {
      this.logger.error('Failed to generate temp token', { error, userId });
      throw error;
    }
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<DecodedToken> {
    try {
      const payload = await TokenUtil.verifyAccessToken(token);
      return payload;
    } catch (error) {
      this.logger.error('Failed to verify access token', { error });
      throw error;
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<DecodedToken> {
    try {
      const payload = await TokenUtil.verifyRefreshToken(token);
      return payload;
    } catch (error) {
      this.logger.error('Failed to verify refresh token', { error });
      throw error;
    }
  }

  /**
   * Extract permissions from user roles
   */
  private extractPermissions(userRoles: any[]): string[] {
    const permissions = new Set<string>();

    userRoles.forEach(ur => {
      // Check if user has admin role (SUPER_ADMIN)
      if (ur.role.code === 'SUPER_ADMIN') {
        permissions.add('*'); // Wildcard for all permissions
        return;
      }

      ur.role.rolePermissions?.forEach((rp: any) => {
        const perm = rp.permission;
        if (perm.module) {
          permissions.add(`${perm.module}:${perm.resource}:${perm.action}`);
        } else {
          permissions.add(`${perm.resource}:${perm.action}`);
        }
      });
    });

    return Array.from(permissions);
  }

  /**
   * Create simplified permission list for API response
   */
  formatPermissions(permissions: string[]): string[] {
    // If user has wildcard permission, return simplified array
    if (permissions.includes('*')) {
      return ['*'];
    }
    return permissions;
  }

  /**
   * Get time until token expiry in seconds
   */
  getTimeUntilExpiry(token: string): number {
    try {
      const decoded = TokenUtil.decode(token);
      if (decoded && decoded.exp) {
        return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(): string {
    return CryptoUtil.generateRandomToken(32);
  }
}
