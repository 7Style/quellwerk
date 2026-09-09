import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { initAuthServices } from '../services/base.service.js';
import type { IAuthModuleConfig } from '../interfaces/module.interface.js';
import type { IAuthEmailSender } from '../interfaces/email-sender.interface.js';

export type PrismaMock = {
  [key: string]: any;
};

export interface TestLogger {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
}

export interface TestInitOptions {
  prisma?: PrismaMock;
  events?: EventEmitter;
  config?: IAuthModuleConfig;
  emailSender?: IAuthEmailSender;
}

export function createTestLogger(): TestLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

export function createEmailSenderMock(): IAuthEmailSender {
  return {
    sendEmail: jest.fn<IAuthEmailSender['sendEmail']>(),
    sendEmailVerificationNotification: jest.fn<IAuthEmailSender['sendEmailVerificationNotification']>(),
    sendWelcomeNotification: jest.fn<IAuthEmailSender['sendWelcomeNotification']>(),
    sendPasswordResetNotification: jest.fn<IAuthEmailSender['sendPasswordResetNotification']>(),
    sendAccountLockedNotification: jest.fn<IAuthEmailSender['sendAccountLockedNotification']>(),
    sendTwoFactorCodeNotification: jest.fn<IAuthEmailSender['sendTwoFactorCodeNotification']>(),
    sendTwoFactorEnabledNotification: jest.fn<IAuthEmailSender['sendTwoFactorEnabledNotification']>(),
    sendTwoFactorDisabledNotification: jest.fn<IAuthEmailSender['sendTwoFactorDisabledNotification']>(),
    sendOneTimePasswordCode: jest.fn<IAuthEmailSender['sendOneTimePasswordCode']>(),
  };
}

export function createPrismaMock(): PrismaMock {
  return {
    user: {},
    session: {},
    twoFactorAuth: {},
    twoFactorBackupCode: {},
    oneTimePasswordLogin: {},
  };
}

/** 32+ character test secrets (the module refuses shorter ones) */
export const TEST_JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
export const TEST_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef01234';
export const TEST_ENCRYPTION_KEY = '12345678901234567890123456789012';

export function createAuthConfig(overrides: Partial<IAuthModuleConfig> = {}): IAuthModuleConfig {
  const logger = overrides.logger ?? createTestLogger();

  return {
    jwtSecret: TEST_JWT_SECRET,
    jwtExpiresIn: '15m',
    refreshSecret: TEST_REFRESH_SECRET,
    refreshExpiresIn: '7d',
    bcryptRounds: 4,
    maxLoginAttempts: 3,
    lockoutDuration: 5 * 60 * 1000,
    sessionMaxAge: 60 * 60 * 1000,
    twoFactorSecret: TEST_ENCRYPTION_KEY,
    rateLimitWindowMs: 60 * 1000,
    rateLimitMax: 5,
    frontendUrl: 'http://localhost:3000',
    logger,
    ...overrides,
  };
}

export function initTestAuthServices(options: TestInitOptions = {}) {
  const prisma = options.prisma ?? createPrismaMock();
  const events = options.events ?? new EventEmitter();
  const config = options.config ?? createAuthConfig();
  const emailSender = options.emailSender;

  initAuthServices({
    prisma: prisma as any,
    events,
    logger: config.logger,
    config,
    emailSender,
  });

  return { prisma, events, config, emailSender };
}
