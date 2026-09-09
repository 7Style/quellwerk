import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createAuthRoutes } from '../routes/auth.routes.js';
import type { AuthController } from '../controllers/auth.controller.js';
import { TokenUtil } from '../internal/utils/token.util.js';
import { TwoFactorService } from '../services/two-factor/two-factor.service.js';
import { TwoFactorAuthService } from '../services/2fa.service.js';
import { TwoFactorProviderFactory } from '../services/two-factor/providers/provider.factory.js';
import { ValidationException } from '../internal/exceptions/base.exception.js';
import {
  TEST_JWT_SECRET,
  TEST_REFRESH_SECRET,
  createAuthConfig,
  createEmailSenderMock,
  createPrismaMock,
  createTestLogger,
  initTestAuthServices,
} from './test-utils.js';

/**
 * Regression tests for the 2FA bypass: a temporary 2FA token (issued by /login
 * after the password check) must never reach /2fa/setup or /2fa/verify-setup,
 * and backup codes must only exist for a confirmed second factor.
 */
describe('2FA setup routes', () => {
  const handled: string[] = [];

  const controllerStub = {
    setup2FA: async (_req: Request, res: Response) => {
      handled.push('setup2FA');
      res.json({ success: true });
    },
    verify2FASetup: async (_req: Request, res: Response) => {
      handled.push('verify2FASetup');
      res.json({ success: true });
    },
    get2FAStatus: async (_req: Request, res: Response) => {
      handled.push('get2FAStatus');
      res.json({ success: true, data: { enabled: false } });
    },
  } as unknown as AuthController;

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRoutes(controllerStub, createAuthConfig()));
    app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
      res.status(err.statusCode ?? 500).json({ message: err.message });
    });
    return app;
  }

  beforeEach(() => {
    handled.length = 0;
    TokenUtil.configure({
      jwtSecret: TEST_JWT_SECRET,
      refreshSecret: TEST_REFRESH_SECRET,
      jwtExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });
  });

  afterEach(() => {
    TokenUtil.configure({ jwtSecret: '', refreshSecret: '' });
  });

  it('rejects the temporary 2FA token on POST /2fa/setup and /2fa/verify-setup', async () => {
    const app = createApp();
    const tempToken = await TokenUtil.generateTempToken(1);

    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ password: 'irrelevant' });
    const verifySetup = await request(app)
      .post('/api/auth/2fa/verify-setup')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ token: '123456' });

    expect(setup.status).toBe(401);
    expect(verifySetup.status).toBe(401);
    expect(handled).toEqual([]);
  });

  it('accepts a full access token on POST /2fa/setup', async () => {
    const app = createApp();
    const accessToken = await TokenUtil.generateAccessToken({
      sub: '1',
      email: 'user@example.com',
      roles: ['USER'],
      permissions: [],
      sessionId: 'session-1',
    });

    const response = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'irrelevant' });

    expect(response.status).toBe(200);
    expect(handled).toEqual(['setup2FA']);
  });

  it('still allows the temporary token to read GET /2fa/status', async () => {
    const app = createApp();
    const tempToken = await TokenUtil.generateTempToken(1);

    const response = await request(app)
      .get('/api/auth/2fa/status')
      .set('Authorization', `Bearer ${tempToken}`);

    expect(response.status).toBe(200);
    expect(handled).toEqual(['get2FAStatus']);
  });
});

describe('TwoFactorService backup codes', () => {
  let service: TwoFactorService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let backupCodes: {
    generateBackupCodes: jest.Mock<(userId: number) => Promise<string[]>>;
    deleteAllBackupCodes: jest.Mock<(userId: number) => Promise<void>>;
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.twoFactorAuth = { findUnique: jest.fn() };
    prisma.user = { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) };
    initTestAuthServices({
      config: createAuthConfig({ logger: createTestLogger() }),
      prisma,
      emailSender: createEmailSenderMock(),
    });
    service = new TwoFactorService();
    backupCodes = {
      generateBackupCodes: jest
        .fn<(userId: number) => Promise<string[]>>()
        .mockResolvedValue(['AAAA-1111', 'BBBB-2222']),
      deleteAllBackupCodes: jest.fn<(userId: number) => Promise<void>>().mockResolvedValue(undefined),
    };
    service['backupCodesService'] = backupCodes as never;
  });

  it('setupTwoFactor returns authenticator data and creates no backup codes', async () => {
    const provider = {
      generateSetup: jest
        .fn<(userId: number) => Promise<unknown>>()
        .mockResolvedValue({ secret: 'SECRET', qrCode: 'QR', manualEntryKey: 'MANUAL' }),
    };
    jest.spyOn(TwoFactorProviderFactory, 'create').mockReturnValue(provider as never);

    const result = await service.setupTwoFactor(7, 'totp');

    expect(provider.generateSetup).toHaveBeenCalledWith(7);
    expect(backupCodes.generateBackupCodes).not.toHaveBeenCalled();
    expect(result).toEqual({ secret: 'SECRET', qrCode: 'QR', manualEntryKey: 'MANUAL' });
    expect(result).not.toHaveProperty('backupCodes');
  });

  it('verifySetup replaces old backup codes and returns the new ones only after a valid code', async () => {
    prisma.twoFactorAuth.findUnique.mockResolvedValue({ userId: 7, type: 'totp', tempSecret: 'enc' });
    const provider = {
      verifySetup: jest
        .fn<(userId: number, token: string) => Promise<{ isValid: boolean }>>()
        .mockResolvedValueOnce({ isValid: false })
        .mockResolvedValueOnce({ isValid: true }),
    };
    jest.spyOn(TwoFactorProviderFactory, 'create').mockReturnValue(provider as never);

    await expect(service.verifySetup(7, '000000')).rejects.toBeInstanceOf(ValidationException);
    expect(backupCodes.deleteAllBackupCodes).not.toHaveBeenCalled();
    expect(backupCodes.generateBackupCodes).not.toHaveBeenCalled();

    const result = await service.verifySetup(7, '123456');

    expect(backupCodes.deleteAllBackupCodes).toHaveBeenCalledWith(7);
    expect(backupCodes.generateBackupCodes).toHaveBeenCalledWith(7);
    expect(result).toEqual({ backupCodes: ['AAAA-1111', 'BBBB-2222'] });
  });
});

describe('TwoFactorAuthService.completeTwoFactorLogin', () => {
  it('does not fall back to verifySetup when a pending tempSecret exists', async () => {
    const prisma = createPrismaMock();
    prisma.twoFactorAuth = {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ userId: 1, tempSecret: 'pending' }),
    };
    initTestAuthServices({
      config: createAuthConfig({ logger: createTestLogger() }),
      prisma,
      emailSender: createEmailSenderMock(),
    });
    const service = new TwoFactorAuthService();
    const verifySetup = jest.fn<() => Promise<unknown>>();
    service['tokenService'] = {
      verifyTempToken: jest.fn<() => Promise<{ userId: number }>>().mockResolvedValue({ userId: 1 }),
    } as never;
    service['userDbService'] = {
      findUserById: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 1, isActive: true }),
    } as never;
    service['twoFactorService'] = {
      verifyLogin: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      verifySetup,
    } as never;
    const finalize = jest.spyOn(service as never, 'finalizeLoginForUser' as never);

    await expect(service.completeTwoFactorLogin('temp', '123456')).rejects.toBeInstanceOf(
      ValidationException
    );

    expect(verifySetup).not.toHaveBeenCalled();
    expect(prisma.twoFactorAuth.findUnique).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });
});
