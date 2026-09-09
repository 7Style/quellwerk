/**
 * DTOs für Audit-Log Liste
 */

import type { AuditLogWithUser, AuditLogListResponse } from '../../audit/types/audit.types.js';

/**
 * Response DTO für Audit-Log Liste
 */
export class AuditLogListDto implements AuditLogListResponse {
  logs: AuditLogWithUser[];
  total: number;
  limit: number;
  offset: number;

  constructor(data: AuditLogListResponse) {
    this.logs = data.logs;
    this.total = data.total;
    this.limit = data.limit;
    this.offset = data.offset;
  }

  toJSON() {
    return {
      success: true,
      data: {
        logs: this.logs,
        total: this.total,
        limit: this.limit,
        offset: this.offset,
      },
    };
  }
}

