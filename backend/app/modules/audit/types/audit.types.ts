/**
 * Audit Types
 * Type definitions for the audit module
 */

/**
 * User info included in audit logs
 */
export interface AuditLogUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Audit log entry with user info
 */
export interface AuditLogWithUser {
  id: number;
  userId?: number;
  user?: AuditLogUser;
  entityType: string;
  entityId?: number;
  action: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  userId?: number;
  entityType?: string;
  entityId?: number;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Response format for audit log list
 */
export interface AuditLogListResponse {
  logs: AuditLogWithUser[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * User statistics in audit logs
 */
export interface AuditLogUserStats {
  userId: number;
  userEmail: string;
  userName: string;
  count: number;
}

/**
 * Audit log statistics
 */
export interface AuditLogStatistics {
  totalLogs: number;
  logsByAction: Record<string, number>;
  logsByEntityType: Record<string, number>;
  logsByUser: AuditLogUserStats[];
  recentActivity: AuditLogWithUser[];
}

/**
 * Supported export formats
 */
export type AuditLogExportFormat = 'csv' | 'json' | 'excel';
