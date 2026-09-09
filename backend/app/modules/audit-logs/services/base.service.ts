/**
 * Audit-Logs Module Local BaseService Implementation
 * Vollständig unabhängig ohne externe Dependencies
 * Implementiert das Clean Code DI Pattern lokal für das Audit-Logs-Modul
 */

import type { PrismaClient } from '../../../lib/prisma.js';
import type { LoggerLike } from '../../audit/interfaces/audit.interface.js';

/**
 * Audit-Logs Module spezifische Dependencies
 */
export interface AuditLogsModuleDependencies {
  prisma: PrismaClient;
  logger: LoggerLike;
  [key: string]: any;
}

// Privater Dependency Store für das Audit-Logs-Modul
let _auditLogsDeps: AuditLogsModuleDependencies | null = null;

/**
 * Initialisiert Audit-Logs-Services mit Dependencies
 * MUSS vor der Verwendung von Audit-Logs-Services aufgerufen werden!
 */
export function initAuditLogsServices(dependencies: AuditLogsModuleDependencies): void {
  if (_auditLogsDeps) {
    dependencies.logger?.warn(
      '[AuditLogs] Services wurden bereits initialisiert. Überschreibe Dependencies.'
    );
  }

  _auditLogsDeps = dependencies;

  dependencies.logger?.info('[AuditLogs] Services initialisiert', {
    hasPrisma: !!dependencies.prisma,
  });
}

/**
 * Basis-Klasse für alle Audit-Logs-Services
 * Bietet Zugriff auf alle injizierten Dependencies
 */
export abstract class BaseAuditLogsService {
  protected prisma: PrismaClient;
  protected logger: LoggerLike;

  constructor() {
    if (!_auditLogsDeps) {
      throw new Error(
        '[AuditLogs] Services nicht initialisiert! ' +
        'Rufe initAuditLogsServices() auf bevor Services erstellt werden.'
      );
    }

    if (!_auditLogsDeps.prisma) {
      throw new Error('[AuditLogs] Prisma client is not available in dependencies');
    }
    if (!_auditLogsDeps.logger) {
      throw new Error('[AuditLogs] Logger is not available in dependencies');
    }

    this.prisma = _auditLogsDeps.prisma;
    this.logger = _auditLogsDeps.logger;
  }

  /**
   * Zugriff auf die kompletten Dependencies
   */
  protected getDependencies(): AuditLogsModuleDependencies {
    if (!_auditLogsDeps) {
      throw new Error('[AuditLogs] Services nicht initialisiert!');
    }
    return _auditLogsDeps;
  }
}

/**
 * Gibt die aktuellen Dependencies zurück (hauptsächlich für Tests)
 */
export function getAuditLogsDependencies(): AuditLogsModuleDependencies | null {
  return _auditLogsDeps;
}

/**
 * Setzt Dependencies zurück (für Tests und Cleanup)
 */
export function resetAuditLogsDependencies(): void {
  if (_auditLogsDeps) {
    _auditLogsDeps.logger?.debug('[AuditLogs] Dependencies werden zurückgesetzt');
  }
  _auditLogsDeps = null;
}

