import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventEmitter } from 'node:events';
import {
  initAuthServices,
  resetAuthDependencies,
  getAuthDependencies,
  areAuthServicesInitialized,
  BaseAuthService,
} from '../services/base.service.js';
import { createAuthConfig, createTestLogger } from './test-utils.js';

describe('BaseAuthService dependency handling', () => {
  beforeEach(() => {
    resetAuthDependencies();
  });

  afterEach(() => {
    resetAuthDependencies();
  });

  class TestService extends BaseAuthService {
    expose() {
      return {
        prisma: this.prisma,
        events: this.events,
        logger: this.logger,
        config: this.config,
      };
    }
  }

  it('throws when created before initAuthServices', () => {
    expect(() => new TestService()).toThrow('[Auth] Services nicht initialisiert');
  });

  it('provides injected dependencies after initialization', () => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger });
    const prisma = { user: {} } as any;
    const events = new EventEmitter();

    initAuthServices({ prisma, events, logger, config });

    expect(areAuthServicesInitialized()).toBe(true);

    const service = new TestService();
    const deps = service.expose();

    expect(deps.prisma).toBe(prisma);
    expect(deps.events).toBe(events);
    expect(deps.logger).toBe(logger);
    expect(deps.config).toBe(config);
    expect(getAuthDependencies()).toEqual({ prisma, events, logger, config });
  });

  it('warns when dependencies are re-initialized', () => {
    const firstLogger = createTestLogger();
    const config = createAuthConfig({ logger: firstLogger });
    const prisma = { user: {} } as any;
    const events = new EventEmitter();

    initAuthServices({ prisma, events, logger: firstLogger, config });

    const secondLogger = createTestLogger();
    initAuthServices({ prisma, events, logger: secondLogger, config });

    expect(secondLogger.warn).toHaveBeenCalledWith(
      '[Auth] Services wurden bereits initialisiert. Überschreibe Dependencies.'
    );
  });

  it('resets dependencies via resetAuthDependencies', () => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger });
    initAuthServices({ prisma: {} as any, events: new EventEmitter(), logger, config });

    expect(areAuthServicesInitialized()).toBe(true);
    resetAuthDependencies();
    expect(areAuthServicesInitialized()).toBe(false);
    expect(getAuthDependencies()).toBeNull();
  });
});
