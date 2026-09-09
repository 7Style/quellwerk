/**
 * Auth-Module Local BaseService Implementation
 * Vollständig unabhängig ohne externe Dependencies
 * Implementiert das Clean Code DI Pattern lokal für das Auth-Modul
 */

import type { PrismaClient } from '../../../lib/prisma.js';
import { EventEmitter } from 'events';
import { IAuthModuleConfig } from '../interfaces/module.interface.js';
import { IAuthEmailSender } from '../interfaces/email-sender.interface.js';

/**
 * Minimal Logger Interface für das Auth-Modul
 */
export interface LoggerLike {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: any, meta?: any): void;
}

/**
 * Auth-Module spezifische Dependencies
 */
export interface AuthModuleDependencies {
  prisma: PrismaClient;
  events: EventEmitter;
  logger: LoggerLike;
  config: IAuthModuleConfig;
  emailSender?: IAuthEmailSender;
  [key: string]: any; // Erlaubt zusätzliche Module-spezifische Dependencies
}

// Privater Dependency Store für das Auth-Modul
let _authDeps: AuthModuleDependencies | null = null;

/**
 * Initialisiert Auth-Services mit Dependencies
 * MUSS vor der Verwendung von Auth-Services aufgerufen werden!
 */
export function initAuthServices(dependencies: AuthModuleDependencies): void {
  if (_authDeps) {
    dependencies.logger?.warn(
      '[Auth] Services wurden bereits initialisiert. Überschreibe Dependencies.'
    );
  }
  
  _authDeps = dependencies;
  
  dependencies.logger?.info('[Auth] Services initialisiert', {
    hasPrisma: !!dependencies.prisma,
    hasEvents: !!dependencies.events,
    hasConfig: !!dependencies.config,
    hasEmailSender: !!dependencies.emailSender,
    additionalDeps: Object.keys(dependencies).filter(
      key => !['prisma', 'events', 'logger', 'config', 'emailSender'].includes(key)
    )
  });
}

/**
 * Basis-Klasse für alle Auth-Services
 * Bietet Zugriff auf alle injizierten Dependencies
 */
export abstract class BaseAuthService {
  protected prisma: PrismaClient;
  protected events: EventEmitter;
  protected logger: LoggerLike;
  protected config: IAuthModuleConfig;
  protected emailSender?: IAuthEmailSender;

  constructor() {
    if (!_authDeps) {
      throw new Error(
        '[Auth] Services nicht initialisiert! ' +
        'Rufe initAuthServices() auf bevor Services erstellt werden.'
      );
    }
    
    this.prisma = _authDeps.prisma;
    this.events = _authDeps.events;
    this.logger = _authDeps.logger;
    this.config = _authDeps.config;
    this.emailSender = _authDeps.emailSender;
  }

  /**
   * Zugriff auf die kompletten Dependencies
   */
  protected getDependencies(): AuthModuleDependencies {
    if (!_authDeps) {
      throw new Error('[Auth] Services nicht initialisiert!');
    }
    return _authDeps;
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
      throw new Error(`[Auth] Required dependency '${key}' is not available`);
    }
    return dep;
  }

  /**
   * Helper: Prüft ob Email-Sender verfügbar ist
   */
  protected hasEmailSender(): boolean {
    return !!this.emailSender;
  }

  /**
   * Helper: Wirft Fehler wenn Email-Sender nicht verfügbar
   */
  protected requireEmailSender(): IAuthEmailSender {
    if (!this.emailSender) {
      throw new Error('Email sender is not configured for this auth module');
    }
    return this.emailSender;
  }
}

/**
 * Gibt die aktuellen Dependencies zurück (hauptsächlich für Tests)
 */
export function getAuthDependencies(): AuthModuleDependencies | null {
  return _authDeps;
}

/**
 * Setzt Dependencies zurück (für Tests und Cleanup)
 */
export function resetAuthDependencies(): void {
  if (_authDeps) {
    _authDeps.logger?.debug('[Auth] Dependencies werden zurückgesetzt');
  }
  _authDeps = null;
}

/**
 * Prüft ob Auth-Services initialisiert sind
 */
export function areAuthServicesInitialized(): boolean {
  return _authDeps !== null;
}