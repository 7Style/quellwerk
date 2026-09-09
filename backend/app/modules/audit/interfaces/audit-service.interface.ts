import type { PrismaClient } from '../../../lib/prisma.js';

export interface LoggerLike {
  info(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}

export interface IAuditService {
  logAction(entry: {
    userId?: number;
    entityType: string;
    entityId?: number;
    action: string;
    changes?: unknown;
    metadata?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;

  logCreate(
    userId: number | null,
    entityType: string,
    entityId: number,
    data: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void>;

  logUpdate(
    userId: number,
    entityType: string,
    entityId: number,
    oldData: unknown,
    newData: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void>;

  logUpdateWithFiles(
    userId: number,
    entityType: string,
    entityId: number,
    oldData: unknown,
    newData: unknown,
    changedFiles: unknown[],
    ipAddress?: string,
    userAgent?: string
  ): Promise<void>;

  logDelete(
    userId: number,
    entityType: string,
    entityId: number,
    data: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void>;
}

export interface AuditServiceDependencies {
  prisma: PrismaClient;
  logger: LoggerLike;
}


