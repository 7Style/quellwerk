import crypto from 'node:crypto';
import { ISessionService, SessionData } from '../interfaces/module.interface.js';
import { BaseAuthService } from './base.service.js';

export class SessionService extends BaseAuthService implements ISessionService {
  private sessionMaxAge: number;

  constructor() {
    super();
    // Default to 24 hours if not configured
    this.sessionMaxAge = this.config.sessionMaxAge || 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Create a new session for user
   */
  async createSession(
    userId: number, 
    metadata?: any
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.sessionMaxAge);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        token: sessionId,
        expiresAt,
        ipAddress: metadata?.ip,
        userAgent: metadata?.userAgent,
      },
    });

    this.logger.info('Session created', { userId, sessionId });
    return sessionId;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      this.logger.debug('Session expired', { sessionId });
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      metadata: {
        ip: session.ipAddress,
        userAgent: session.userAgent
      },
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, _data: any): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(),
      },
    });

    this.logger.debug('Session updated', { sessionId });
  }

  /**
   * Delete a specific session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.delete({
        where: { id: sessionId },
      });
      this.logger.info('Session deleted', { sessionId });
    } catch {
      // Session might already be deleted
      this.logger.debug('Session not found for deletion', { sessionId });
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: number): Promise<void> {
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });

    this.logger.info('User sessions deleted', { userId, count: result.count });
  }

  /**
   * Find active session by user and session ID
   */
  async findActiveSession(userId: number, sessionId: string): Promise<SessionData | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!session) {
      return null;
    }

    // Update last used timestamp
    await this.updateSessionActivity(session.id);

    return {
      id: session.id,
      userId: session.userId,
      metadata: {
        ip: session.ipAddress,
        userAgent: session.userAgent
      },
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Verify if session is valid
   */
  async verifySession(userId: number, sessionId: string): Promise<boolean> {
    const session = await this.findActiveSession(userId, sessionId);
    return session !== null;
  }

  /**
   * Update session last activity
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(),
      },
    });
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      this.logger.info(`Cleaned up ${result.count} expired sessions`);
    }

    return result.count;
  }

  /**
   * Get all active sessions for user
   */
  async getUserSessions(userId: number): Promise<SessionData[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastActivityAt: 'desc',
      },
    });

    return sessions.map((session: {
      id: string;
      userId: number;
      ipAddress: string | null;
      userAgent: string | null;
      expiresAt: Date;
    }) => ({
      id: session.id,
      userId: session.userId,
      metadata: {
        ip: session.ipAddress,
        userAgent: session.userAgent
      },
      expiresAt: session.expiresAt,
    }));
  }

  /**
   * Terminate all user sessions except current
   */
  async terminateOtherSessions(userId: number, currentSessionId: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        userId,
        NOT: {
          id: currentSessionId,
        },
      },
    });

    this.logger.info(`Terminated ${result.count} sessions for user ${userId}`);
    return result.count;
  }

  /**
   * Delete all user sessions
   */
  async deleteAllUserSessions(userId: number): Promise<void> {
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });

    this.logger.info(`Deleted ${result.count} sessions for user ${userId}`);
  }
}
