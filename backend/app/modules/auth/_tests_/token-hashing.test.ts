import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { UserDbService } from '../services/user-db.service.js';
import { AuthService } from '../services/auth.service.js';
import {
  createAuthConfig,
  createEmailSenderMock,
  createPrismaMock,
  createTestLogger,
  initTestAuthServices,
} from './test-utils.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('reset and verification tokens at rest', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let db: UserDbService;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.user = {
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
    };
    initTestAuthServices({ config: createAuthConfig({ logger: createTestLogger() }), prisma });
    db = new UserDbService();
  });

  it('stores the SHA-256 hash of a password reset token and looks it up by hash, unexpired only', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await db.savePasswordResetToken(1, 'raw-reset-token', expiresAt);

    const stored = prisma.user.update.mock.calls[0][0].data.resetToken as string;
    expect(stored).toBe(sha256('raw-reset-token'));
    expect(stored).not.toBe('raw-reset-token');
    expect(prisma.user.update.mock.calls[0][0].data.resetTokenExpires).toBe(expiresAt);

    prisma.user.findFirst.mockResolvedValueOnce({ id: 1, email: 'a@example.com', emailVerified: true, isActive: true, loginSecurityMode: 'NONE' });
    const found = await db.findByPasswordResetToken('raw-reset-token');

    expect(found).toMatchObject({ id: 1 });
    const args = prisma.user.findFirst.mock.calls[0][0];
    expect(args.where.resetToken).toBe(stored);
    expect(args.where.resetTokenExpires.gt).toBeInstanceOf(Date);
    expect(args.select).not.toHaveProperty('resetToken');
    expect(args.select).not.toHaveProperty('password');
  });

  it('stores the SHA-256 hash of an email verification token and looks it up by hash, unexpired only', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await db.saveEmailVerificationToken(2, 'raw-verify-token', expiresAt);

    const stored = prisma.user.update.mock.calls[0][0].data.emailVerificationToken as string;
    expect(stored).toBe(sha256('raw-verify-token'));

    await db.findByEmailVerificationToken('raw-verify-token');
    const args = prisma.user.findFirst.mock.calls[0][0];
    expect(args.where.emailVerificationToken).toBe(stored);
    expect(args.where.emailVerificationExpires.gt).toBeInstanceOf(Date);
    expect(args.select).not.toHaveProperty('emailVerificationToken');
  });

  it('reads the password hash only through findPasswordHash with an explicit select', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ password: '$2b$04$hash' });

    await expect(db.findPasswordHash(1)).resolves.toBe('$2b$04$hash');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, select: { password: true } });
  });

  it('requestPasswordReset mails the raw token while the database receives the hash', async () => {
    const emailSender = createEmailSenderMock();
    initTestAuthServices({ config: createAuthConfig({ logger: createTestLogger() }), prisma, emailSender });
    const authService = new AuthService();
    (authService as unknown as { userDbService: UserDbService }).userDbService.findByEmail = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 5, email: 'reset@example.com', emailVerified: true, isActive: true, loginSecurityMode: 'NONE' }) as never;

    await authService.requestPasswordReset('reset@example.com');

    const mailed = (emailSender.sendPasswordResetNotification as jest.Mock).mock.calls[0];
    const rawToken = mailed[1] as string;
    const stored = prisma.user.update.mock.calls[0][0].data.resetToken as string;

    expect(mailed[0]).toBe('reset@example.com');
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).toBe(sha256(rawToken));
    expect(stored).not.toBe(rawToken);
  });
});
