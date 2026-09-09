import { describe, expect, it, jest } from '@jest/globals';
import { AuthModule } from '../auth.module.js';
import { createAuthConfig, createTestLogger } from './test-utils.js';
import { areAuthServicesInitialized } from '../services/base.service.js';

const createPrismaClient = () => ({
  $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([{ alive: 1 }]),
  $disconnect: jest.fn(),
  user: {},
  session: {},
  twoFactorAuth: {},
  twoFactorBackupCode: {},
  oneTimePasswordLogin: {},
});

describe('AuthModule', () => {
  it('mounts routes and exposes services', () => {
    const logger = createTestLogger();
    const config = {
      ...createAuthConfig({ logger }),
      rateLimitWindowMs: 1000,
      rateLimitMax: 10,
    };
    const prismaClient = createPrismaClient();
    const module = new AuthModule({ ...config, prismaClient: prismaClient as any });

    expect(areAuthServicesInitialized()).toBe(true);

    const app = { use: jest.fn() } as any;
    module.mount(app);

    expect(app.use).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('[Auth] Module mounted at /api/auth');

    const services = module.getServices();
    expect(services.auth).toBeDefined();
    expect(services.session).toBeDefined();
    expect(services.twoFactor).toBeDefined();
    expect(services.oneTimePassword).toBeDefined();
  });

  it('uses the injected rate limit store factory for every limiter', () => {
    const logger = createTestLogger();
    const stores: string[] = [];
    const rateLimitStore = jest.fn((name: string) => {
      stores.push(name);
      return undefined as any; // express-rate-limit falls back to its memory store
    });
    const config = createAuthConfig({ logger, rateLimitStore });
    new AuthModule({ ...config, prismaClient: createPrismaClient() as any });

    expect(rateLimitStore).toHaveBeenCalled();
    expect(stores).toEqual(
      expect.arrayContaining(['auth-login', 'auth-refresh', 'auth-password-reset', 'auth-2fa'])
    );
  });

  it('performs health check based on prisma connectivity', async () => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger });
    const prismaClient = createPrismaClient();
    const module = new AuthModule({ ...config, prismaClient: prismaClient as any });

    const healthy = await module.healthCheck();
    expect(healthy.status).toBe('healthy');

    prismaClient.$queryRaw.mockRejectedValueOnce(new Error('offline'));
    const unhealthy = await module.healthCheck();
    expect(unhealthy.status).toBe('unhealthy');
    expect(unhealthy.details.error).toBe('offline');
  });

  it('resets dependencies on shutdown', async () => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger });
    const prismaClient = createPrismaClient();
    const module = new AuthModule({ ...config, prismaClient: prismaClient as any });

    expect(areAuthServicesInitialized()).toBe(true);
    await module.shutdown();
    expect(areAuthServicesInitialized()).toBe(false);
  });
});
