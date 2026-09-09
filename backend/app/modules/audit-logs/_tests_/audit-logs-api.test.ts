/**
 * Audit-Logs API Tests
 * Tests für die REST-API-Endpoints
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AuditLogsController } from '../controllers/audit-logs.controller.js';
import { AuditLogsApiService } from '../services/audit-logs-api.service.js';
import { initAuditLogsServices, resetAuditLogsDependencies } from '../services/base.service.js';
import type { PrismaClient } from '../../../lib/prisma.js';

// Mock Prisma
type PrismaFn = (...args: unknown[]) => Promise<unknown>;
const auditLogMock = {
  create: jest.fn<PrismaFn>(),
  findMany: jest.fn<PrismaFn>(),
  findUnique: jest.fn<PrismaFn>(),
  count: jest.fn<PrismaFn>(),
};
const mockPrisma = { auditLog: auditLogMock } as unknown as PrismaClient & { auditLog: typeof auditLogMock };

// Mock Logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const sampleLog = {
  id: 1,
  userId: 1,
  entityType: 'company',
  entityId: 123,
  action: 'CREATE',
  changes: { new: { name: 'Test' } },
  metadata: null,
  ipAddress: '127.0.0.1',
  userAgent: 'test',
  createdAt: new Date(),
  user: {
    id: 1,
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  },
};

describe('AuditLogsApiService', () => {
  let service: AuditLogsApiService;

  beforeAll(() => {
    initAuditLogsServices({
      prisma: mockPrisma,
      logger: mockLogger,
    });
    service = new AuditLogsApiService();
  });

  afterAll(() => {
    resetAuditLogsDependencies();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuditLogs', () => {
    it('should return audit logs with filters', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([sampleLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.getAuditLogs({
        entityType: 'company',
        limit: 10,
        offset: 0,
      });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.logs[0].entityType).toBe('company');
      expect(result.logs[0].user?.email).toBe('test@example.com');
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityType: 'company' }, take: 10, skip: 0 })
      );
    });
  });

  describe('getAuditLogById', () => {
    it('should return single audit log', async () => {
      mockPrisma.auditLog.findUnique.mockResolvedValue({ ...sampleLog, action: 'UPDATE' });

      const result = await service.getAuditLogById(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.action).toBe('UPDATE');
    });

    it('should return null if log not found', async () => {
      mockPrisma.auditLog.findUnique.mockResolvedValue(null);

      const result = await service.getAuditLogById(999);

      expect(result).toBeNull();
    });
  });

  describe('getAuditLogStatistics', () => {
    it('should return statistics aggregated from the matching logs', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        sampleLog,
        { ...sampleLog, id: 2, action: 'UPDATE' },
      ]);

      const result = await service.getAuditLogStatistics({});

      expect(result.totalLogs).toBe(2);
      expect(result.logsByAction.CREATE).toBe(1);
      expect(result.logsByAction.UPDATE).toBe(1);
      expect(result.logsByEntityType.company).toBe(2);
      expect(result.logsByUser).toEqual([
        expect.objectContaining({ userId: 1, userEmail: 'test@example.com', count: 2 }),
      ]);
      expect(result.recentActivity).toHaveLength(2);
    });
  });
});

describe('AuditLogsController', () => {
  let controller: AuditLogsController;
  let service: AuditLogsApiService;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response> & { json: jest.Mock; status: jest.Mock };

  beforeAll(() => {
    initAuditLogsServices({
      prisma: mockPrisma,
      logger: mockLogger,
    });
    service = new AuditLogsApiService();
    controller = new AuditLogsController(service);
  });

  afterAll(() => {
    resetAuditLogsDependencies();
  });

  beforeEach(() => {
    mockReq = {
      query: {},
      params: {},
    };
    const res: any = {};
    res.json = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    mockRes = res;
  });

  describe('getAuditLogs', () => {
    it('should return audit logs', async () => {
      mockReq.query = { limit: '10', offset: '0' };
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await controller.getAuditLogs(mockReq as Request, mockRes as unknown as Response);

      expect(mockRes.json).toHaveBeenCalled();
      const callArgs = mockRes.json.mock.calls[0][0] as { success: boolean; data: { logs: unknown[]; limit: number } };
      expect(callArgs.success).toBe(true);
      expect(callArgs.data.logs).toEqual([]);
      expect(callArgs.data.limit).toBe(10);
    });

    it('rejects invalid query parameters with a zod error', async () => {
      mockReq.query = { limit: 'abc' };

      await expect(
        controller.getAuditLogs(mockReq as Request, mockRes as unknown as Response)
      ).rejects.toMatchObject({ name: 'ZodError' });
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('getAuditLogById', () => {
    it('returns 400 for a non numeric id', async () => {
      mockReq.params = { id: 'nope' };

      await controller.getAuditLogById(mockReq as Request, mockRes as unknown as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
