import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { AuthService } from '../services/auth.service.js';
import { AuthEvents } from '../events/auth.events.js';
import {
  InvalidCredentialsException,
  AccountLockedException,
  EmailNotVerifiedException,
  AccountDisabledException,
  OtpRequiredException,
} from '../internal/exceptions/auth.exception.js';
import { PasswordUtil } from '../internal/utils/password.util.js';
import type { TokenService } from '../services/token.service.js';
import { AuthMainService } from '../services/auth-main-service.js';
import {
  createAuthConfig,
  createEmailSenderMock,
  createTestLogger,
  initTestAuthServices,
} from './test-utils.js';
import type { IAuthModuleConfig } from '../interfaces/module.interface.js';

interface TestUser {
  id: number;
  email: string;
  password: string;
  isActive: boolean;
  emailVerified: boolean;
  lockedUntil: Date | null;
  failedAttempts: number;
  loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
  userRoles: any[];
}

describe('AuthService.login', () => {
  let authService: AuthService;
  let events: EventEmitter;
  let emitSpy: jest.Spied<EventEmitter['emit']>;
  let config: IAuthModuleConfig;
  let baseUser: TestUser;

  beforeEach(() => {
    const logger = createTestLogger();
    config = createAuthConfig({ logger });
    const emailSender = createEmailSenderMock();
    const deps = initTestAuthServices({ config, emailSender });
    events = deps.events;
    emitSpy = jest.spyOn(events, 'emit');
    authService = new AuthService();

    baseUser = {
      id: 1,
      email: 'user@example.com',
      password: 'hashed-password',
      isActive: true,
      emailVerified: true,
      lockedUntil: null,
      failedAttempts: 0,
      loginSecurityMode: 'none',
      userRoles: [],
    };

    // Default mocks on internal services
    const userDbService: any = (authService as any).userDbService;
    userDbService.resetFailedAttempts = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    userDbService.findUserWithRolesAndPermissions = jest.fn();
    userDbService.findPasswordHash = jest.fn<() => Promise<string | null>>().mockResolvedValue('hashed-password');
    userDbService.incrementFailedAttempts = jest.fn<() => Promise<number>>().mockResolvedValue(1);
    userDbService.lockAccount = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const sessionService: any = (authService as any).sessionService;
    sessionService.createSession = jest.fn<() => Promise<string>>().mockResolvedValue('session-id');

    const tokenService: any = (authService as any).tokenService;
    tokenService.generateTokenPair = jest
      .fn<() => Promise<{ accessToken: string; refreshToken: string }>>()
      .mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    tokenService.generateTempToken = jest.fn<() => Promise<string>>().mockResolvedValue('temp-token');

    const twoFactorService: any = authService.getTwoFactorService();
    twoFactorService.getStatus = jest.fn<() => Promise<{ enabled: boolean }>>().mockResolvedValue({ enabled: false });

    jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(true);
  });

  it('returns auth result when credentials are valid and 2FA disabled', async () => {
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(baseUser);

    const finalizeSpy = jest
      .spyOn(AuthMainService.prototype as any, 'finalizeLoginForUser')
      .mockResolvedValue({ ok: true });

    const result = await authService.login('user@example.com', 'Password123!', { ip: '1.1.1.1' });

    expect(result).toEqual({ ok: true });
    expect(userDbService.resetFailedAttempts).toHaveBeenCalledWith(baseUser.id);
    expect(finalizeSpy).toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalledWith(AuthEvents.LOGIN_FAILED, expect.anything());
  });

  it('emits login failed and throws when user does not exist', async () => {
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(null);

    await expect(authService.login('missing@example.com', 'Password123!')).rejects.toBeInstanceOf(
      InvalidCredentialsException
    );
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.LOGIN_FAILED,
      expect.objectContaining({
        email: 'missing@example.com',
        reason: 'User not found',
      })
    );
  });

  it('throws when account is locked and emits event', async () => {
    const lockedUser = { ...baseUser, lockedUntil: new Date(Date.now() + 10_000) };
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(lockedUser);

    await expect(authService.login(lockedUser.email, 'Password123!')).rejects.toBeInstanceOf(
      AccountLockedException
    );
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.LOGIN_FAILED,
      expect.objectContaining({
        email: lockedUser.email,
        reason: 'Account locked',
      })
    );
  });

  it('throws when account is disabled and emits event', async () => {
    const disabledUser = { ...baseUser, isActive: false };
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(disabledUser);

    await expect(authService.login(disabledUser.email, 'Password123!')).rejects.toBeInstanceOf(
      AccountDisabledException
    );
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.LOGIN_FAILED,
      expect.objectContaining({
        email: disabledUser.email,
        reason: 'Account disabled',
      })
    );
  });

  it('rejects password login with OtpRequiredException when login security mode is one_time_password', async () => {
    const otpUser = { ...baseUser, loginSecurityMode: 'one_time_password' as const };
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(otpUser);

    await expect(authService.login(otpUser.email, 'Password123!')).rejects.toBeInstanceOf(
      OtpRequiredException
    );
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.LOGIN_FAILED,
      expect.objectContaining({
        email: otpUser.email,
        reason: 'One-time password required',
      })
    );
  });

  it('throws when password is invalid and increments failed attempts', async () => {
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(baseUser);
    const handleFailedLoginSpy = jest.spyOn(AuthMainService.prototype as any, 'handleFailedLogin');
    jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(false);

    await expect(authService.login(baseUser.email, 'WrongPassword')).rejects.toBeInstanceOf(
      InvalidCredentialsException
    );
    expect(handleFailedLoginSpy).toHaveBeenCalledWith(baseUser.id, baseUser.email, undefined);
  });

  it('throws when email is not verified and emits event', async () => {
    const unverifiedUser = { ...baseUser, emailVerified: false };
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(unverifiedUser);

    await expect(authService.login(unverifiedUser.email, 'Password123!')).rejects.toBeInstanceOf(
      EmailNotVerifiedException
    );
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.LOGIN_FAILED,
      expect.objectContaining({
        email: unverifiedUser.email,
        reason: 'Email not verified',
      })
    );
  });

  it('returns temp token flow when 2FA is enabled', async () => {
    const twoFactorUser = { ...baseUser };
    const userDbService: any = (authService as any).userDbService;
    userDbService.findUserWithRolesAndPermissions.mockResolvedValue(twoFactorUser);
    jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(true);

    const twoFactorService: any = authService.getTwoFactorService();
    twoFactorService.getStatus.mockResolvedValue({ enabled: true });

    const result = await authService.login(twoFactorUser.email, 'Password123!');

    expect(result).toEqual({
      user: expect.objectContaining({ email: twoFactorUser.email }),
      tokens: { accessToken: 'temp-token', refreshToken: '' },
      requiresTwoFactor: true,
    });

    const tokenService: TokenService = (authService as any).tokenService;
    expect(tokenService.generateTempToken).toHaveBeenCalledWith(twoFactorUser.id);
    expect(emitSpy).toHaveBeenCalledWith(
      'auth:2fa:required',
      expect.objectContaining({ userId: twoFactorUser.id })
    );
  });
});

describe('AuthMainService.handleFailedLogin', () => {
  it('locks account and sends notification after max attempts', async () => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger, maxLoginAttempts: 2, lockoutDuration: 60_000 });
    const emailSender = createEmailSenderMock();
    const { events } = initTestAuthServices({ config, emailSender });
    const emitSpy = jest.spyOn(events, 'emit');
    const authService = new AuthService();

    const userDbService: any = (authService as any).userDbService;
    userDbService.incrementFailedAttempts = jest.fn<() => Promise<number>>().mockResolvedValue(2);
    userDbService.lockAccount = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await (authService as any).handleFailedLogin(5, 'user@example.com', { ip: '1.1.1.1' });

    expect(userDbService.incrementFailedAttempts).toHaveBeenCalledWith(5);
    expect(userDbService.lockAccount).toHaveBeenCalled();
    expect(emailSender.sendAccountLockedNotification).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(
      AuthEvents.ACCOUNT_LOCKED,
      expect.objectContaining({
        userId: 5,
        email: 'user@example.com',
      })
    );
  });

  it('does not lock account when attempts below threshold', async () => {
    const logger = createTestLogger();
    const config = createAuthConfig({ logger, maxLoginAttempts: 3 });
    initTestAuthServices({ config, emailSender: createEmailSenderMock() });
    const authService = new AuthService();

    const userDbService: any = (authService as any).userDbService;
    userDbService.incrementFailedAttempts = jest.fn<() => Promise<number>>().mockResolvedValue(1);
    userDbService.lockAccount = jest.fn();

    await (authService as any).handleFailedLogin(1, 'user@example.com');

    expect(userDbService.incrementFailedAttempts).toHaveBeenCalledWith(1);
    expect(userDbService.lockAccount).not.toHaveBeenCalled();
  });
});
