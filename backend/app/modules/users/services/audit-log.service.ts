import { AuditServiceImpl, type IAuditService } from '../../audit/index.js';
import { logger } from '../../../common/utils/logger.util.js';

/**
 * User Module Audit Service
 * Handles audit logging for user module
 */
export class UserAuditLogService {
  private auditService: IAuditService;

  constructor() {
    // Instantiate AuditServiceImpl which uses the initialized dependencies (Prisma, Logger)
    this.auditService = new AuditServiceImpl();
  }

  /**
   * Log generic action
   */
  async logAction(entry: {
    userId: number;
    entityType: string;
    entityId?: number;
    action: string;
    changes?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.auditService.logAction(entry);
      logger.debug('User audit log created', {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
      });
    } catch (error) {
      logger.error('Failed to create user audit log', error);
    }
  }

  /**
   * Log user view
   */
  async logUserView(
    userId: number,
    viewedUserId: number,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'user',
      entityId: viewedUserId,
      action: 'VIEW',
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log user creation
   */
  async logUserCreate(
    userId: number | null, // null for public registration
    createdUserId: number,
    userData: any,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId: userId || createdUserId, // If no actor (public), the user created themselves (sort of)
      entityType: 'user',
      entityId: createdUserId,
      action: 'CREATE',
      changes: { new: userData },
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log user update
   */
  async logUserUpdate(
    userId: number,
    updatedUserId: number,
    oldData: any,
    newData: any,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'user',
      entityId: updatedUserId,
      action: 'UPDATE',
      changes: { old: oldData, new: newData },
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log user deletion
   */
  async logUserDelete(
    userId: number,
    deletedUserId: number,
    deletedData: any,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'user',
      entityId: deletedUserId,
      action: 'DELETE',
      changes: { old: deletedData },
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log role assignment/removal
   */
  async logRoleChange(
    userId: number,
    targetUserId: number,
    action: 'ASSIGN_ROLE' | 'REMOVE_ROLE',
    roleData: any,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'user_role',
      entityId: targetUserId,
      action,
      changes: { ...roleData }, // Role changes are usually specific
      metadata,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log bulk action
   */
  async logBulkAction(
    userId: number,
    action: string,
    data: any,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType: 'user',
      action: action.toUpperCase(),
      changes: { data },
      metadata,
      ipAddress,
      userAgent
    });
  }
}

