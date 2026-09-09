import { IAuditService, AuditServiceDependencies, LoggerLike } from '../interfaces/audit-service.interface.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../common/utils/logger.util.js';

// Wrapper to make winston logger compatible with LoggerLike
const loggerWrapper: LoggerLike = {
  info: (msg, ...meta) => logger.info(msg, ...meta),
  error: (msg, ...meta) => logger.error(msg, ...meta),
  warn: (msg, ...meta) => logger.warn(msg, ...meta),
  debug: (msg, ...meta) => logger.debug(msg, ...meta),
};

let _dependencies: AuditServiceDependencies = {
  prisma: prisma,
  logger: loggerWrapper
};

export function initAuditService(dependencies: AuditServiceDependencies) {
  _dependencies = dependencies;
}

export class AuditServiceImpl implements IAuditService {
  private prisma = _dependencies.prisma;
  private logger = _dependencies.logger;

  async logAction(entry: {
    userId?: number;
    entityType: string;
    entityId?: number;
    action: string;
    changes?: unknown;
    metadata?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          changes: (entry.changes as object) || {},
          metadata: (entry.metadata as object) || {},
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
    }
  }

  async logCreate(
    userId: number | null,
    entityType: string,
    entityId: number,
    data: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId: userId || undefined,
      entityType,
      entityId,
      action: 'CREATE',
      changes: { new: data },
      ipAddress,
      userAgent,
    });
  }

  async logUpdate(
    userId: number,
    entityType: string,
    entityId: number,
    oldData: unknown,
    newData: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType,
      entityId,
      action: 'UPDATE',
      changes: { old: oldData, new: newData },
      ipAddress,
      userAgent,
    });
  }

  async logUpdateWithFiles(
    userId: number,
    entityType: string,
    entityId: number,
    oldData: unknown,
    newData: unknown,
    changedFiles: unknown[],
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType,
      entityId,
      action: 'UPDATE',
      changes: { old: oldData, new: newData, files: changedFiles },
      ipAddress,
      userAgent,
    });
  }

  async logDelete(
    userId: number,
    entityType: string,
    entityId: number,
    data: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logAction({
      userId,
      entityType,
      entityId,
      action: 'DELETE',
      changes: { old: data },
      ipAddress,
      userAgent,
    });
  }
}


