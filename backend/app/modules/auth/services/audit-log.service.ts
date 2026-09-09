import { BaseAuthService } from './base.service.js';

/**
 * Auth Module Audit Service
 * Handles audit logging for auth module
 */
export class AuthAuditLogService extends BaseAuthService {
  /**
   * Log generic action
   */
  async logAction(entry: {
    userId?: number;
    entityType: string;
    entityId?: number;
    action: string;
    changes?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      if (this.config.auditAdapter) {
        await this.config.auditAdapter.log({
          action: entry.action,
          userId: entry.userId || 0, // 0 for unknown/system
          ip: entry.ipAddress,
          userAgent: entry.userAgent,
          metadata: {
            entityType: entry.entityType,
            entityId: entry.entityId,
            changes: entry.changes,
            ...entry.metadata,
          },
        });
      }

      this.logger.debug('Auth audit log created', {
        entityType: entry.entityType,
        action: entry.action,
      });
    } catch (error) {
      this.logger.error('Failed to create auth audit log', error);
    }
  }

  /**
   * Log user login
   */
  async logLogin(
    userId: number,
    email: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'auth',
      action: 'LOGIN',
      metadata: { ...metadata, email },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log failed login
   */
  async logLoginFailed(
    email: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId: 0,
      entityType: 'auth',
      action: 'LOGIN_FAILED',
      metadata: { ...metadata, email, reason },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log logout
   */
  async logLogout(
    userId: number,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'auth',
      action: 'LOGOUT',
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log password reset request
   */
  async logPasswordResetRequest(
    email: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId: 0, // User might not be verified yet
      entityType: 'auth',
      action: 'PASSWORD_RESET_REQUEST',
      metadata: { ...metadata, email },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log password reset complete
   */
  async logPasswordResetComplete(
    userId: number,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'auth',
      action: 'PASSWORD_RESET_COMPLETE',
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log 2FA actions
   */
  async log2FAAction(
    userId: number,
    action: 'SETUP' | 'VERIFY' | 'DISABLE',
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'auth_2fa',
      action: `2FA_${action}`,
      metadata,
      ipAddress,
      userAgent
    });
  }
}





