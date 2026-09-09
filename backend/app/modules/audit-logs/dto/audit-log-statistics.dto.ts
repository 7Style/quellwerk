/**
 * DTOs für Audit-Log Statistiken
 */

import type { AuditLogStatistics } from '../../audit/types/audit.types.js';

/**
 * Response DTO für Audit-Log Statistiken
 */
export class AuditLogStatisticsDto implements AuditLogStatistics {
  totalLogs: number;
  logsByAction: Record<string, number>;
  logsByEntityType: Record<string, number>;
  logsByUser: Array<{
    userId: number;
    userEmail: string;
    userName: string;
    count: number;
  }>;
  recentActivity: AuditLogStatistics['recentActivity'];

  constructor(data: AuditLogStatistics) {
    this.totalLogs = data.totalLogs;
    this.logsByAction = data.logsByAction;
    this.logsByEntityType = data.logsByEntityType;
    this.logsByUser = data.logsByUser;
    this.recentActivity = data.recentActivity;
  }

  toJSON() {
    return {
      success: true,
      data: {
        totalLogs: this.totalLogs,
        logsByAction: this.logsByAction,
        logsByEntityType: this.logsByEntityType,
        logsByUser: this.logsByUser,
        recentActivity: this.recentActivity,
      },
    };
  }
}

