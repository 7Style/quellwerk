/**
 * Audit-Logs API Service
 * Service für das Abrufen von Audit-Logs über die REST-API
 */

import { BaseAuditLogsService } from './base.service.js';
import type {
  AuditLogFilters,
  AuditLogWithUser,
  AuditLogListResponse,
  AuditLogStatistics,
  AuditLogExportFormat,
} from '../../audit/types/audit.types.js';

export class AuditLogsApiService extends BaseAuditLogsService {
  /**
   * Get audit logs with filters
   */
  async getAuditLogs(filters: AuditLogFilters): Promise<AuditLogListResponse> {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Map to AuditLogWithUser format
    const mappedLogs: AuditLogWithUser[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId || undefined,
      user: log.user
        ? {
            id: log.user.id,
            email: log.user.email,
            firstName: log.user.firstName,
            lastName: log.user.lastName,
          }
        : undefined,
      entityType: log.entityType,
      entityId: log.entityId || undefined,
      action: log.action,
      changes: log.changes as any,
      metadata: log.metadata as any,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      createdAt: log.createdAt,
    }));

    return {
      logs: mappedLogs,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get single audit log by ID
   */
  async getAuditLogById(id: number): Promise<AuditLogWithUser | null> {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!log) {
      return null;
    }

    return {
      id: log.id,
      userId: log.userId || undefined,
      user: log.user
        ? {
            id: log.user.id,
            email: log.user.email,
            firstName: log.user.firstName,
            lastName: log.user.lastName,
          }
        : undefined,
      entityType: log.entityType,
      entityId: log.entityId || undefined,
      action: log.action,
      changes: log.changes as any,
      metadata: log.metadata as any,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      createdAt: log.createdAt,
    };
  }

  /**
   * Get audit log statistics
   */
  async getAuditLogStatistics(filters?: AuditLogFilters): Promise<AuditLogStatistics> {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.action) where.action = filters.action;

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    // Get all logs for statistics
    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate statistics
    const totalLogs = logs.length;
    const logsByAction: Record<string, number> = {};
    const logsByEntityType: Record<string, number> = {};
    const logsByUserMap: Map<number, { userId: number; userEmail: string; userName: string; count: number }> = new Map();

    logs.forEach((log) => {
      // Count by action
      logsByAction[log.action] = (logsByAction[log.action] || 0) + 1;

      // Count by entity type
      logsByEntityType[log.entityType] = (logsByEntityType[log.entityType] || 0) + 1;

      // Count by user
      if (log.userId && log.user) {
        const existing = logsByUserMap.get(log.userId);
        if (existing) {
          existing.count++;
        } else {
          logsByUserMap.set(log.userId, {
            userId: log.userId,
            userEmail: log.user.email,
            userName: `${log.user.firstName} ${log.user.lastName}`,
            count: 1,
          });
        }
      }
    });

    // Get recent activity (last 10)
    const recentActivity: AuditLogWithUser[] = logs.slice(0, 10).map((log) => ({
      id: log.id,
      userId: log.userId || undefined,
      user: log.user
        ? {
            id: log.user.id,
            email: log.user.email,
            firstName: log.user.firstName,
            lastName: log.user.lastName,
          }
        : undefined,
      entityType: log.entityType,
      entityId: log.entityId || undefined,
      action: log.action,
      changes: log.changes as any,
      metadata: log.metadata as any,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      createdAt: log.createdAt,
    }));

    return {
      totalLogs,
      logsByAction,
      logsByEntityType,
      logsByUser: Array.from(logsByUserMap.values()).sort((a, b) => b.count - a.count),
      recentActivity,
    };
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    format: AuditLogExportFormat,
    filters: AuditLogFilters
  ): Promise<string | Buffer> {
    const result = await this.getAuditLogs({ ...filters, limit: 10000 }); // Large limit for export

    if (format === 'json') {
      return JSON.stringify(result.logs, null, 2);
    }

    if (format === 'csv') {
      const headers = [
        'ID',
        'User ID',
        'User Email',
        'User Name',
        'Entity Type',
        'Entity ID',
        'Action',
        'IP Address',
        'User Agent',
        'Created At',
      ];
      const rows = result.logs.map((log) => [
        log.id.toString(),
        log.userId?.toString() || '',
        log.user?.email || '',
        log.user ? `${log.user.firstName} ${log.user.lastName}` : '',
        log.entityType,
        log.entityId?.toString() || '',
        log.action,
        log.ipAddress || '',
        log.userAgent || '',
        log.createdAt.toISOString(),
      ]);

      // Cells that start with a formula trigger get a leading quote so that
      // spreadsheet applications treat them as text (CSV formula injection
      // through attacker-controlled user agents or e-mail addresses).
      const escapeCell = (cell: string): string => {
        const text = String(cell);
        const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${guarded.replace(/"/g, '""')}"`;
      };
      const csvContent = [headers, ...rows]
        .map((row) => row.map(escapeCell).join(','))
        .join('\n');

      return csvContent;
    }

    if (format === 'excel') {
      // For Excel, we'll return CSV format (can be enhanced later with proper Excel library)
      return this.exportAuditLogs('csv', filters);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }
}

