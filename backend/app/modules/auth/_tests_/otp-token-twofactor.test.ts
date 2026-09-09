import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { OtpAuthService } from '../services/otp.service.js';
import { AuthEvents } from '../events/auth.events.js';
import { ValidationException } from '../internal/exceptions/base.exception.js';
import {
  AccountDisabledException,
  AccountLockedException,
  EmailNotVerifiedException,
  InvalidTokenException,
} from '../internal/exceptions/auth.exception.js';
import { OneTimePasswordService } from '../services/one-time-password/one-time-password.service.js';
import { CryptoUtil } from '../internal/utils/crypto.util.js';
import { AuthMainService } from '../services/auth-main-service.js';
import { TokenUtil } from '../internal/utils/token.util.js';
import { TokenService } from '../services/token.service.js';
import { AuthService } from '../services/auth.service.js';
import { TwoFactorService } from '../services/two-factor/two-factor.service.js';
import { TwoFactorProviderFactory } from '../services/two-factor/providers/provider.factory.js';
import {
  createAuthConfig,
  createEmailSenderMock,
  createPrismaMock,
  createTestLogger,
  initTestAuthServices,
} from './test-utils.js';
import type { IAuthModuleConfig } from '../interfaces/module.interface.js';

const otpUser = {
  id: 10,
  email: 'otp@example.com',
  firstName: 'Otp',
  lastName: 'User',
  isActive: true,
  emailVerified: true,
  lockedUntil: null,
  failedAttempts: 0,
  loginSecurityMode: 'one_time_password' as const,
  preferredLanguage: 'de',
  userRoles: [],
};

describe('OtpAuthService', () => {
  let otpService: OtpAuthService;
  let events: EventEmitter;
  let config: IAuthModuleConfig;
  let prisma: any;

  beforeEach(() => {
    const logger = createTestLogger();
    config = createAuthConfig({ logger });
    const emailSender = createEmailSenderMock();
    const deps = initTestAuthServices({ config, emailSender });
    events = deps.events;
    prisma = deps.prisma;
    otpService = new OtpAuthService();
  });

  it('throws UnauthorizedException when user not found or OTP not enabled', async () => {
    const userDbService: any = (otpService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
    const createChallengeSpy = jest.spyOn((otpService as any).oneTimePasswordService, 'createChallenge');

    await expect(otpService.requestOneTimePassword('missing@example.com')).rejects.toThrow(
      'Invalid email or password'
    );

    expect(createChallengeSpy).not.toHaveBeenCalled();
  });

  it('creates challenge and emits event when OTP mode active', async () => {
    const userDbService: any = (otpService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions = jest.fn<() => Promise<unknown>>().mockResolvedValue(otpUser);

    const challenge = {
      challengeToken: 'challenge-token',
      expiresAt: new Date(Date.now() + 60_000),
      delivered: true,
      deliveryMethod: 'email' as const,
    };
    const createChallengeSpy = jest
      .spyOn((otpService as any).oneTimePasswordService, 'createChallenge')
      .mockResolvedValue(challenge);

    const emitSpy = jest.spyOn(events, 'emit');
    const result = await otpService.requestOneTimePassword('otp@example.com');

    expect(result).toEqual(challenge);
    expect(createChallengeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: otpUser.id }));
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.ONE_TIME_PASSWORD_REQUESTED,
      expect.objectContaining({
        userId: otpUser.id,
        email: otpUser.email,
      })
    );
  });

  it('throws appropriate exceptions for invalid states', async () => {
    const lockedUser = { ...otpUser, lockedUntil: new Date(Date.now() + 60_000) };
    const inactiveUser = { ...otpUser, isActive: false };
    const unverifiedUser = { ...otpUser, emailVerified: false, lockedUntil: null, isActive: true };
    const userDbService: any = (otpService as any).userDbService;

    userDbService.findUserWithRolesAndPermissions = jest.fn<() => Promise<unknown>>().mockResolvedValue(lockedUser);
    await expect(otpService.requestOneTimePassword(lockedUser.email)).rejects.toBeInstanceOf(
      AccountLockedException
    );

    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(inactiveUser);
    await expect(otpService.requestOneTimePassword(inactiveUser.email)).rejects.toBeInstanceOf(
      AccountDisabledException
    );

    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(unverifiedUser);
    await expect(otpService.requestOneTimePassword(unverifiedUser.email)).rejects.toBeInstanceOf(
      EmailNotVerifiedException
    );
  });

  it('verifies OTP code successfully and emits event', async () => {
    const userDbService: any = (otpService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions = jest.fn<() => Promise<unknown>>().mockResolvedValue({ ...otpUser });
    // The service loads the user after the code was verified (password setup check)
    userDbService.findUserById = jest.fn<() => Promise<unknown>>().mockResolvedValue({ ...otpUser });

    const verifySpy = jest
      .spyOn((otpService as any).oneTimePasswordService, 'verifyCode')
      .mockResolvedValue({ userId: otpUser.id });

    const completeResult = {
      user: { id: otpUser.id, email: otpUser.email },
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    };
    const finalizeSpy = jest
      .spyOn(AuthMainService.prototype as any, 'finalizeLoginForUser')
      .mockResolvedValue(completeResult);

    const emitSpy = jest.spyOn(events, 'emit');

    const result = await otpService.verifyOneTimePassword({ challengeToken: 'challenge', code: '123456' });

    expect(verifySpy).toHaveBeenCalledWith('challenge', '123456');
    expect(finalizeSpy).toHaveBeenCalledWith(otpUser.id, undefined, { allowedModes: ['one_time_password'] });
    // Non-consultant OTP users never need a password setup
    expect(result).toEqual({ ...completeResult, requiresPasswordSetup: false });
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.ONE_TIME_PASSWORD_VERIFIED,
      expect.objectContaining({ userId: otpUser.id })
    );
  });

  it('emits failure event when verification fails', async () => {
    const userDbService: any = (otpService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions = jest.fn<() => Promise<unknown>>().mockResolvedValue({ ...otpUser });

    jest
      .spyOn((otpService as any).oneTimePasswordService, 'verifyCode')
      .mockRejectedValue(new ValidationException('bad'));
    prisma.oneTimePasswordLogin = {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        user: { email: 'otp@example.com' },
      }),
    };

    const emitSpy = jest.spyOn(events, 'emit');

    await expect(
      otpService.verifyOneTimePassword({ challengeToken: 'ch', code: '000000' })
    ).rejects.toBeInstanceOf(ValidationException);

    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.ONE_TIME_PASSWORD_FAILED,
      expect.objectContaining({
        email: 'otp@example.com',
        reason: 'bad',
      })
    );
  });

  it('verifies deep link tokens and emits events', async () => {
    const userDbService: any = (otpService as any).userDbService;
    userDbService.findUserById = jest.fn<() => Promise<unknown>>().mockResolvedValue({ ...otpUser });
    jest
      .spyOn((otpService as any).oneTimePasswordService, 'verifyDeepLink')
      .mockResolvedValue({ userId: otpUser.id });

    const completeResult = {
      user: { id: otpUser.id, email: otpUser.email },
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
    };
    const finalizeSpy = jest
      .spyOn(AuthMainService.prototype as any, 'finalizeLoginForUser')
      .mockResolvedValue(completeResult);

    const emitSpy = jest.spyOn(events, 'emit');

    const result = await otpService.verifyOneTimePasswordToken('deep-link-token');

    expect(finalizeSpy).toHaveBeenCalledWith(otpUser.id, undefined, { allowedModes: ['one_time_password'] });
    // Non-consultant OTP users never need a password setup
    expect(result).toEqual({ ...completeResult, requiresPasswordSetup: false });
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.ONE_TIME_PASSWORD_VERIFIED,
      expect.objectContaining({ userId: otpUser.id })
    );
  });
});

describe('OneTimePasswordService.verifyCode', () => {
  let otpDbService: OneTimePasswordService;
  let prisma: any;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.oneTimePasswordLogin = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    const config = createAuthConfig({ logger: createTestLogger() });
    initTestAuthServices({ config, prisma });
    otpDbService = new OneTimePasswordService();
  });

  it('marks code as consumed and returns user id on success', async () => {
    const record = {
      id: 1,
      userId: 42,
      codeHash: 'hash',
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    prisma.oneTimePasswordLogin.findUnique.mockResolvedValue(record);
    prisma.oneTimePasswordLogin.update.mockResolvedValue({ ...record, attempts: 1 });

    jest.spyOn(CryptoUtil, 'compareHash').mockReturnValue(true);

    const result = await otpDbService.verifyCode('token', '123456');

    expect(result).toEqual({ userId: 42 });
    expect(prisma.oneTimePasswordLogin.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    });
  });

  it('increments attempts and consumes on too many invalid tries', async () => {
    const record = {
      id: 2,
      userId: 42,
      codeHash: 'hash',
      attempts: 4,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    prisma.oneTimePasswordLogin.findUnique.mockResolvedValue(record);
    prisma.oneTimePasswordLogin.update
      .mockResolvedValueOnce({ ...record, attempts: 5 })
      .mockResolvedValueOnce({ ...record, attempts: 5, consumedAt: new Date() });

    jest.spyOn(CryptoUtil, 'compareHash').mockReturnValue(false);

    await expect(otpDbService.verifyCode('token', 'wrong')).rejects.toThrow('Der eingegebene Code ist ungültig.');
    expect(prisma.oneTimePasswordLogin.update).toHaveBeenNthCalledWith(1, {
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    expect(prisma.oneTimePasswordLogin.update).toHaveBeenNthCalledWith(2, {
      where: { id: record.id },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('expires outdated codes and throws validation error', async () => {
    const expiredRecord = {
      id: 3,
      userId: 42,
      codeHash: 'hash',
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    };
    prisma.oneTimePasswordLogin.findUnique.mockResolvedValue(expiredRecord);
    prisma.oneTimePasswordLogin.update.mockResolvedValue({ ...expiredRecord, consumedAt: new Date() });

    jest.spyOn(CryptoUtil, 'compareHash').mockReturnValue(true);

    await expect(otpDbService.verifyCode('token', '123456')).rejects.toThrow('Dieser Code ist abgelaufen.');
    expect(prisma.oneTimePasswordLogin.update).toHaveBeenCalledWith({
      where: { id: expiredRecord.id },
      data: { consumedAt: expect.any(Date) },
    });
  });
});

describe('AuthService.refreshToken & TokenService', () => {
  let authService: AuthService;
  let events: EventEmitter;
  let tokenService: TokenService;

  beforeEach(() => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger });
    const deps = initTestAuthServices({ config, emailSender: createEmailSenderMock() });
    events = deps.events;
    authService = new AuthService();
    tokenService = new TokenService();
  });

  it('refreshes token pair when session and user valid', async () => {
    const emitSpy = jest.spyOn(events, 'emit');

    const tokenSvc: any = (authService as any).tokenService;
    // Refresh token payloads carry the user id as `sub` (string) plus the session id
    tokenSvc.verifyRefreshToken = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ sub: '1', type: 'refresh', sessionId: 'sess-1' });
    const userDb: any = (authService as any).userDbService;
    userDb.findUserById = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 1, isActive: true, email: 'u@example.com' });
    const sessionSvc: any = (authService as any).sessionService;
    sessionSvc.getSession = jest.fn<() => Promise<unknown>>().mockResolvedValue({ userId: 1 });
    tokenSvc.generateTokenPair = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' });

    const result = await authService.refreshToken('refresh-token');

    expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    expect(userDb.findUserById).toHaveBeenCalledWith(1);
    expect(sessionSvc.getSession).toHaveBeenCalledWith('sess-1');
    expect(emitSpy).toHaveBeenCalledWith(AuthEvents.TOKEN_REFRESHED, expect.objectContaining({ userId: 1 }));
  });

  it('throws InvalidTokenException when user missing', async () => {
    const tokenSvc: any = (authService as any).tokenService;
    tokenSvc.verifyRefreshToken = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ sub: '1', type: 'refresh', sessionId: 'sess-1' });
    const userDb: any = (authService as any).userDbService;
    userDb.findUserById = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);

    await expect(authService.refreshToken('refresh-token')).rejects.toBeInstanceOf(InvalidTokenException);
  });

  it('round-trips real tokens with the shared issuer/audience configuration', async () => {
    const pair = await tokenService.generateTokenPair(
      {
        id: 7,
        email: 'seven@example.com',
        userRoles: [{ role: { id: 1, name: 'User', code: 'USER', rolePermissions: [] } }],
      },
      'session-7'
    );

    const access = await tokenService.verifyAccessToken(pair.accessToken);
    expect(access.sub).toBe('7');
    expect(access.iss).toBe('bp-monolith');
    expect(access.aud).toBe('bp-monolith-api');

    const refresh = await tokenService.verifyRefreshToken(pair.refreshToken);
    expect(refresh.sub).toBe('7');
    expect(refresh.sessionId).toBe('session-7');

    // Temporary 2FA tokens use the same signing configuration
    const temp = await tokenService.generateTempToken(7);
    await expect(tokenService.verifyTempToken(temp)).resolves.toEqual({ userId: 7 });
    await expect(tokenService.verifyAccessToken(temp)).rejects.toThrow('Invalid token type');
  });

  it('passes wildcard permissions for SUPER_ADMIN in token payload', async () => {
    const user = {
      id: 1,
      email: 'admin@example.com',
      userRoles: [
        {
          role: {
            id: 1,
            name: 'SUPER_ADMIN',
            code: 'SUPER_ADMIN',
            rolePermissions: [{ permission: { module: 'auth', resource: 'users', action: 'manage' } }],
          },
        },
      ],
    };

    const accessSpy = jest.spyOn(TokenUtil, 'generateAccessToken').mockResolvedValue('access');
    const refreshSpy = jest.spyOn(TokenUtil, 'generateRefreshToken').mockResolvedValue('refresh');

    const result = await tokenService.generateTokenPair(user as any, 'session');

    expect(accessSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: ['*'],
        roles: ['SUPER_ADMIN'],
      })
    );
    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(refreshSpy).toHaveBeenCalledWith(user.id, 'session');
  });
});

describe('TwoFactorService', () => {
  let twoFactorService: TwoFactorService;
  let prisma: any;
  let backupCodesMock: {
    generateBackupCodes: jest.Mock<(userId: number) => Promise<string[]>>;
    verifyAndUseBackupCode: jest.Mock<(userId: number, code: string) => Promise<boolean>>;
    deleteAllBackupCodes: jest.Mock<(userId: number) => Promise<void>>;
    getRemainingBackupCodesCount: jest.Mock<(userId: number) => Promise<number>>;
  };

  beforeEach(() => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger });
    prisma = createPrismaMock();
    prisma.twoFactorAuth = {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    prisma.twoFactorBackupCode = {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    };
    prisma.user = {
      findUnique: jest.fn(),
    };
    initTestAuthServices({ config, prisma, emailSender: createEmailSenderMock() });
    twoFactorService = new TwoFactorService();
    backupCodesMock = {
      generateBackupCodes: jest.fn<(userId: number) => Promise<string[]>>().mockResolvedValue(['code-1', 'code-2']),
      verifyAndUseBackupCode: jest.fn<(userId: number, code: string) => Promise<boolean>>().mockResolvedValue(false),
      deleteAllBackupCodes: jest.fn<(userId: number) => Promise<void>>().mockResolvedValue(undefined),
      getRemainingBackupCodesCount: jest.fn<(userId: number) => Promise<number>>().mockResolvedValue(2),
    };
    twoFactorService['backupCodesService'] = backupCodesMock as any;
    twoFactorService['emailService'] = {
      sendTwoFactorEnabledNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendTwoFactorDisabledNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as any;
  });

  it('returns provider setup data without issuing backup codes', async () => {
    const provider = {
      generateSetup: jest
        .fn<(userId: number) => Promise<unknown>>()
        .mockResolvedValue({ secret: 'SECRET', qrCode: 'QR', manualEntryKey: 'MANUAL' }),
    };
    jest.spyOn(TwoFactorProviderFactory, 'create').mockReturnValue(provider as any);

    const result = await twoFactorService.setupTwoFactor(1, 'totp');

    expect(provider.generateSetup).toHaveBeenCalledWith(1);
    expect(backupCodesMock.generateBackupCodes).not.toHaveBeenCalled();
    expect(result).toEqual({ secret: 'SECRET', qrCode: 'QR', manualEntryKey: 'MANUAL' });
  });

  it('verifies login using backup codes before provider verification', async () => {
    prisma.twoFactorAuth.findUnique.mockResolvedValue({
      userId: 1,
      verifiedAt: new Date(),
      type: 'totp',
      secret: 'encrypted',
    });
    backupCodesMock.verifyAndUseBackupCode.mockResolvedValue(true);
    const provider = {
      verify: jest.fn(),
    };
    jest.spyOn(TwoFactorProviderFactory, 'create').mockReturnValue(provider as any);

    const result = await twoFactorService.verifyLogin(1, 'backup-code');

    expect(backupCodesMock.verifyAndUseBackupCode).toHaveBeenCalledWith(1, 'backup-code');
    expect(provider.verify).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('invokes audit adapter during admin reset', async () => {
    const auditAdapter = { log: jest.fn<(event: unknown) => Promise<void>>().mockResolvedValue(undefined) };
    const logger = createTestLogger();
    const config = createAuthConfig({ logger, auditAdapter });
    initTestAuthServices({ config, prisma, emailSender: createEmailSenderMock() });
    const service = new TwoFactorService();
    service['backupCodesService'] = twoFactorService['backupCodesService'];
    service['emailService'] = twoFactorService['emailService'];
    const disableSpy = jest.spyOn(service, 'disableTwoFactor').mockResolvedValue(undefined);

    await service.adminReset(2, 99);

    expect(disableSpy).toHaveBeenCalledWith(2);
    expect(auditAdapter.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TWO_FACTOR_ADMIN_RESET', userId: 99 })
    );
  });
});
