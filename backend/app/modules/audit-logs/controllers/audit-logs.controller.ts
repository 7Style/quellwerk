/**
 * Audit-Logs Controller
 * Controller für Audit-Logs API-Endpoints
 */

import type { Request, Response } from 'express';
import { AuditLogsApiService } from '../services/audit-logs-api.service.js';
import {
  AuditLogListDto,
  AuditLogStatisticsDto,
  auditLogExportSchema,
  auditLogFilterSchema,
} from '../dto/index.js';

export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsApiService) {}

  /**
   * Get audit logs with filters
   * GET /api/audit-logs
   */
  async getAuditLogs(req: Request, res: Response): Promise<void> {
    const filters = auditLogFilterSchema.parse(req.query);
    const result = await this.auditLogsService.getAuditLogs(filters);
    const responseDto = new AuditLogListDto(result);
    res.json(responseDto.toJSON());
  }

  /**
   * Get single audit log by ID
   * GET /api/audit-logs/:id
   */
  async getAuditLogById(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid audit log ID',
      });
      return;
    }

    const log = await this.auditLogsService.getAuditLogById(id);
    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Audit log not found',
      });
      return;
    }

    res.json({
      success: true,
      data: log,
    });
  }

  /**
   * Get audit log statistics
   * GET /api/audit-logs/statistics
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    const hasFilters = Object.keys(req.query).length > 0;
    const filters = hasFilters ? auditLogFilterSchema.parse(req.query) : undefined;

    const statistics = await this.auditLogsService.getAuditLogStatistics(filters);
    const responseDto = new AuditLogStatisticsDto(statistics);
    res.json(responseDto.toJSON());
  }

  /**
   * Export audit logs
   * GET /api/audit-logs/export
   */
  async exportAuditLogs(req: Request, res: Response): Promise<void> {
    const { format, ...filters } = auditLogExportSchema.parse(req.query);
    const exportData = await this.auditLogsService.exportAuditLogs(format, filters);

    // Set appropriate headers
    const contentTypeMap: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const filenameMap: Record<string, string> = {
      csv: 'audit-logs.csv',
      json: 'audit-logs.json',
      excel: 'audit-logs.xlsx',
    };

    res.setHeader('Content-Type', contentTypeMap[format] ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filenameMap[format] ?? 'audit-logs'}"`
    );

    res.send(exportData);
  }
}
