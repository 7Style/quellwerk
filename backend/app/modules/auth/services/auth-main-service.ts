import {
  AuthResult,
  AuthSecurityMode,
} from '../interfaces/module.interface.js';
import {
  CryptoUtil,
  PasswordUtil,
  TokenUtil,
  InvalidTokenException,
  ValidationException,
  AccountLockedException,
  AccountDisabledException,
  EmailNotVerifiedException,
  NotFoundException,
} from '../internal/index.js';
import { AuthEvents } from '../events/auth.events.js';
import { BaseAuthService } from './base.service.js';
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER } from '../internal/utils/token.util.js';
import { UserDbService, UserLookup, UserWithRolesAndPermissions } from './user-db.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';
import { OneTimePasswordService } from './one-time-password/one-time-password.service.js';
import { EmailService } from './email-notifications/email-service.js';

interface FinalizeLoginOptions {
  allowedModes?: AuthSecurityMode[];
}

export class AuthMainService extends BaseAuthService {
  protected userDbService: UserDbService;
  protected sessionService: SessionService;
  protected tokenService: TokenService;
  protected twoFactorService: TwoFactorService;
  protected oneTimePasswordService: OneTimePasswordService;
  protected moduleEmailService?: EmailService;

  constructor() {
    super();

    this.userDbService = new UserDbService();
    this.sessionService = new SessionService();
    this.tokenService = new TokenService();

    this.moduleEmailService = this.emailSender
      ? new EmailService(this.emailSender)
      : undefined;

    this.twoFactorService = new TwoFactorService(this.moduleEmailService);
    this.oneTimePasswordService = new OneTimePasswordService(this.moduleEmailService);

    PasswordUtil.configure({
      bcryptRounds: this.config.bcryptRounds,
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    });

    TokenUtil.configure({
      jwtSecret: this.config.jwtSecret,
      jwtExpiresIn: this.config.jwtExpiresIn,
      refreshSecret: this.config.refreshSecret,
      refreshExpiresIn: this.config.refreshExpiresIn,
      issuer: this.config.jwtIssuer || DEFAULT_JWT_ISSUER,
      audience: this.config.jwtAudience || DEFAULT_JWT_AUDIENCE,
    });

    // Key for 2FA secret encryption at rest (ENCRYPTION_KEY of the host app)
    CryptoUtil.configure({ encryptionKey: this.config.twoFactorSecret });
  }

  protected async handleFailedLogin(
    userId: number,
    email: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<void> {
    const attempts = await this.userDbService.incrementFailedAttempts(userId);

    this.events.emit(AuthEvents.LOGIN_FAILED, {
      email,
      reason: 'Invalid password',
      ip: metadata?.ip,
      attemptNumber: attempts,
      timestamp: new Date(),
    });

    if (attempts >= (this.config.maxLoginAttempts || 5)) {
      const lockUntil = new Date(
        Date.now() + (this.config.lockoutDuration || 15 * 60 * 1000)
      );
      await this.userDbService.lockAccount(userId, lockUntil);

      this.events.emit(AuthEvents.ACCOUNT_LOCKED, {
        userId,
        email,
        reason: 'Max login attempts exceeded',
        lockedUntil: lockUntil,
        timestamp: new Date(),
      });

      try {
        if (this.emailSender?.sendAccountLockedNotification) {
          await this.emailSender.sendAccountLockedNotification(email, lockUntil.toISOString());
        }
      } catch (notifyError) {
        this.logger.warn('Failed to send account locked email', { notifyError, email });
      }
    }
  }

  protected async resetFailedAttempts(userId: number): Promise<void> {
    await this.userDbService.resetFailedAttempts(userId);
  }

  /**
   * Both tokens are 32 random bytes; the raw value is returned for the e-mail
   * only, the database keeps a SHA-256 hash (UserDbService) and the lookups
   * accept unexpired hashes only. A token is cleared on use (resetPassword,
   * setupPassword, markEmailAsVerified), so it works once.
   */
  protected async generateEmailVerificationToken(userId: number): Promise<string> {
    const token = CryptoUtil.generateRandomToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.userDbService.saveEmailVerificationToken(userId, token, expiresAt);
    return token;
  }

  protected async generatePasswordResetToken(userId: number): Promise<string> {
    const token = CryptoUtil.generateRandomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.userDbService.savePasswordResetToken(userId, token, expiresAt);
    return token;
  }

  protected async verifyEmailToken(token: string): Promise<UserLookup> {
    const user = await this.userDbService.findByEmailVerificationToken(token);

    if (!user) {
      throw new InvalidTokenException('Invalid or expired verification token');
    }

    return user;
  }

  protected async verifyPasswordResetToken(token: string): Promise<UserLookup> {
    const user = await this.userDbService.findByPasswordResetToken(token);

    if (!user) {
      throw new InvalidTokenException('Invalid or expired reset token');
    }

    return user;
  }

  protected mapUserToDto(user: UserWithRolesAndPermissions): any {
    const roles = user.userRoles?.map((ur: any) => ur.role.code) || [];
    this.logger.debug('Mapping user to DTO', {
      userId: user.id,
      email: user.email,
      roles,
      userRolesCount: user.userRoles?.length || 0,
    });
    
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      roles,
      permissions: this.extractPermissions(user.userRoles),
      loginSecurityMode: user.loginSecurityMode || 'none',
    };
  }

  protected extractPermissions(userRoles: any[]): string[] {
    if (!userRoles) {
      return [];
    }

    const permissions = new Set<string>();
    userRoles.forEach((userRole) => {
      userRole.role.rolePermissions?.forEach((rp: any) => {
        permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });
    return Array.from(permissions);
  }

  protected get otpLoginModel() {
    return (this.prisma as any).oneTimePasswordLogin;
  }

  protected async finalizeLoginForUser(
    userId: number,
    metadata?: { ip?: string; userAgent?: string },
    options?: FinalizeLoginOptions
  ): Promise<AuthResult> {
    const user = await this.userDbService.findUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new AccountDisabledException();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedException(
        user.lockedUntil,
        this.config.maxLoginAttempts! - user.failedAttempts
      );
    }

    if (!user.emailVerified) {
      throw new EmailNotVerifiedException();
    }

    if (options?.allowedModes && !options.allowedModes.map(mode => mode.toLowerCase()).includes(user.loginSecurityMode.toLowerCase())) {
      throw new ValidationException('Loginmodus für diesen Account erlaubt den aktuellen Flow nicht.');
    }

    const sessionId = await this.sessionService.createSession(userId, metadata);

    const freshUser = await this.userDbService.findUserWithRolesAndPermissions(user.email);
    if (!freshUser) {
      throw new NotFoundException('User not found');
    }

    const tokens = await this.tokenService.generateTokenPair(freshUser, sessionId);

    await this.userDbService.updateLastLogin(userId, metadata?.ip);

    this.events.emit(AuthEvents.USER_LOGIN, {
      userId,
      email: user.email,
      ip: metadata?.ip,
      userAgent: metadata?.userAgent,
      timestamp: new Date(),
    });

    return {
      user: this.mapUserToDto(freshUser),
      tokens,
    };
  }

  getSessionService(): SessionService {
    return this.sessionService;
  }

  getTwoFactorService(): TwoFactorService {
    return this.twoFactorService;
  }

  getOneTimePasswordService(): OneTimePasswordService {
    return this.oneTimePasswordService;
  }
}
