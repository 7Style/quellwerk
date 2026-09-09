/**
 * Gemeinsame Basis-Service Klasse für alle Module
 * Implementiert das Clean Code DI Pattern mit globaler Initialisierung
 */

import type { PrismaClient } from '../../lib/prisma.js';
import { EventEmitter } from 'events';
import { logger as defaultLogger } from '../utils/logger.util.js';

// Minimal Logger contract accepted by BaseService
export interface LoggerLike {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: any, meta?: any): void;
}

/**
 * Basis-Dependencies die alle Services benötigen
 */
export interface BaseServiceDependencies {
  prisma: PrismaClient;
  events: EventEmitter;
  logger?: LoggerLike;
}

/**
 * Erweiterte Dependencies für Module-spezifische Anforderungen
 * Module können diese erweitern mit eigenen Interfaces
 */
export interface ServiceDependencies extends BaseServiceDependencies {
  // Module-spezifische configs
  config?: Record<string, any>;
  // Erlaubt Module-spezifische Erweiterungen
  [key: string]: any;
}

// Globaler Dependency Store
let _deps: ServiceDependencies | null = null;

/**
 * Initialisiert alle Services mit gemeinsamen Dependencies
 * MUSS vor der Verwendung von Services aufgerufen werden!
 */
export function initServices(dependencies: ServiceDependencies): void {
  if (_deps) {
    (dependencies.logger || defaultLogger).warn(
      'Services wurden bereits initialisiert. Überschreibe Dependencies.'
    );
  }
  
  _deps = dependencies;
  
  (dependencies.logger || defaultLogger).info('Services initialisiert', {
    hasPrisma: !!dependencies.prisma,
    hasEvents: !!dependencies.events,
    hasConfig: !!dependencies.config,
    additionalDeps: Object.keys(dependencies).filter(
      key => !['prisma', 'events', 'logger', 'config'].includes(key)
    )
  });
}

/**
 * Basis-Klasse für alle Services
 * Alle Services erben von dieser Klasse und haben automatisch Zugriff auf:
 * - prisma: Datenbankzugriff
 * - events: Event-System  
 * - logger: Logging
 * - config: Konfiguration (optional)
 */
export abstract class BaseService {
  protected prisma: PrismaClient;
  protected events: EventEmitter;
  protected logger: LoggerLike;

  constructor() {
    if (!_deps) {
      throw new Error(
        'Services nicht initialisiert! ' +
        'Rufe initServices() auf bevor Services erstellt werden. ' +
        'Dies sollte beim Start der Anwendung passieren.'
      );
    }
    
    this.prisma = _deps.prisma;
    this.events = _deps.events;
    this.logger = _deps.logger || defaultLogger;
  }

  /**
   * Zugriff auf die kompletten Dependencies (für erweiterte Use-Cases)
   */
  protected getDependencies(): ServiceDependencies {
    if (!_deps) {
      throw new Error('Services nicht initialisiert!');
    }
    return _deps;
  }

  /**
   * Helper: Zugriff auf Module-spezifische Config
   */
  protected getConfig<T = any>(key?: string): T {
    const deps = this.getDependencies();
    if (!deps.config) {
      throw new Error('Keine Konfiguration verfügbar');
    }
    
    if (key) {
      return deps.config[key] as T;
    }
    
    return deps.config as T;
  }

  /**
   * Helper: Prüft ob eine optionale Dependency verfügbar ist
   */
  protected hasDependency(key: string): boolean {
    const deps = this.getDependencies();
    return key in deps && deps[key] !== undefined;
  }

  /**
   * Helper: Holt eine optionale Dependency
   */
  protected getDependency<T = any>(key: string): T | undefined {
    const deps = this.getDependencies();
    return deps[key] as T | undefined;
  }

  /**
   * Helper: Holt eine required Dependency
   */
  protected requireDependency<T = any>(key: string): T {
    const dep = this.getDependency<T>(key);
    if (!dep) {
      throw new Error(`Required dependency '${key}' is not available`);
    }
    return dep;
  }
}

/**
 * Gibt die aktuellen Dependencies zurück (hauptsächlich für Tests)
 */
export function getServiceDependencies(): ServiceDependencies | null {
  return _deps;
}

/**
 * Setzt Dependencies zurück (für Tests und Cleanup)
 */
export function resetServiceDependencies(): void {
  if (_deps) {
    (_deps.logger || defaultLogger).debug('Service Dependencies werden zurückgesetzt');
  }
  _deps = null;
}

/**
 * Prüft ob Services initialisiert sind
 */
export function areServicesInitialized(): boolean {
  return _deps !== null;
}

/**
 * Type Guards für Module-spezifische Dependencies
 */
export function hasModuleConfig<T = any>(deps: ServiceDependencies): deps is ServiceDependencies & { config: T } {
  return 'config' in deps && deps.config !== undefined;
}





