import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'node:crypto';
import { SessionService } from '../services/session.service.js';
import { createAuthConfig, createTestLogger, initTestAuthServices } from './test-utils.js';

describe('SessionService', () => {
  const baseDate = new Date('2024-01-01T00:00:00.000Z');
  let logger = createTestLogger();
  let prisma: any;
  let service: SessionService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(baseDate);
    // Session ids come from node:crypto.randomUUID (uuid package removed)
    jest.spyOn(crypto, 'randomUUID').mockReturnValue('session-uuid' as `${string}-${string}-${string}-${string}-${string}`);
    logger = createTestLogger();
    prisma = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const config = createAuthConfig({ logger, sessionMaxAge: 60_000 });
    initTestAuthServices({ prisma, config });
    service = new SessionService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('creates session records with generated UUID and metadata', async () => {
    prisma.session.create.mockResolvedValue({});

    const sessionId = await service.createSession(42, { ip: '1.2.3.4', userAgent: 'jest' });

    expect(sessionId).toBe('session-uuid');
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'session-uuid',
        userId: 42,
        token: 'session-uuid',
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      }),
    });
    expect(logger.info).toHaveBeenCalledWith('Session created', { userId: 42, sessionId: 'session-uuid' });
  });

  it('returns null when session not found or expired', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    expect(await service.getSession('missing')).toBeNull();

    prisma.session.findUnique.mockResolvedValue({
      id: 'expired',
      userId: 1,
      expiresAt: new Date(baseDate.getTime() - 1),
      ipAddress: null,
      userAgent: null,
    });
    expect(await service.getSession('expired')).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith('Session expired', { sessionId: 'expired' });
  });

  it('returns hydrated session when not expired', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'valid',
      userId: 7,
      expiresAt: new Date(baseDate.getTime() + 10_000),
      ipAddress: '5.5.5.5',
      userAgent: 'ua',
    });

    const session = await service.getSession('valid');

    expect(session).toEqual({
      id: 'valid',
      userId: 7,
      metadata: { ip: '5.5.5.5', userAgent: 'ua' },
      expiresAt: new Date(baseDate.getTime() + 10_000),
    });
  });

  it('updates session activity via updateSession', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'active',
      userId: 9,
      expiresAt: new Date(baseDate.getTime() + 10_000),
      ipAddress: null,
      userAgent: null,
    });

    await service.updateSession('active', {});

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'active' },
      data: { lastActivityAt: expect.any(Date) },
    });
    expect(logger.debug).toHaveBeenCalledWith('Session updated', { sessionId: 'active' });
  });

  it('verifies active sessions and terminates stale ones', async () => {
    const sessionRecord = {
      id: 'current',
      userId: 5,
      expiresAt: new Date(baseDate.getTime() + 10_000),
      ipAddress: null,
      userAgent: null,
    };
    prisma.session.findFirst.mockResolvedValue(sessionRecord);
    prisma.session.update.mockResolvedValue(undefined);

    const verified = await service.verifySession(5, 'current');
    expect(verified).toBe(true);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'current' },
      data: { lastActivityAt: expect.any(Date) },
    });

    prisma.session.findFirst.mockResolvedValue(null);
    expect(await service.verifySession(5, 'missing')).toBe(false);
  });

  it('cleans up expired sessions and logs when records removed', async () => {
    prisma.session.deleteMany.mockResolvedValue({ count: 3 });
    const count = await service.cleanupExpiredSessions();

    expect(count).toBe(3);
    expect(logger.info).toHaveBeenCalledWith('Cleaned up 3 expired sessions');
  });

  it('returns active sessions ordered by last activity', async () => {
    const future = new Date(baseDate.getTime() + 10_000);
    prisma.session.findMany.mockResolvedValue([
      { id: 'a', userId: 1, ipAddress: '1', userAgent: 'a', expiresAt: future },
      { id: 'b', userId: 1, ipAddress: '2', userAgent: 'b', expiresAt: future },
    ]);

    const sessions = await service.getUserSessions(1);

    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      orderBy: { lastActivityAt: 'desc' },
    });
    expect(sessions).toEqual([
      { id: 'a', userId: 1, metadata: { ip: '1', userAgent: 'a' }, expiresAt: future },
      { id: 'b', userId: 1, metadata: { ip: '2', userAgent: 'b' }, expiresAt: future },
    ]);
  });
});
