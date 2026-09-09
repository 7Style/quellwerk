import {
  IAuthService,
  AuthResult,
  TokenPair,
  RegisterData,
  OneTimePasswordRequestResult,
  OneTimePasswordVerifyInput,
} from "../interfaces/module.interface.js";
import {
  PasswordUtil,
  ValidationException,
  NotFoundException,
} from "../internal/index.js";
import {
  InvalidCredentialsException,
  AccountLockedException,
  AccountDisabledException,
  EmailNotVerifiedException,
  InvalidTokenException,
  OtpRequiredException,
} from "../internal/exceptions/auth.exception.js";
import { AuthSecurityMode } from "../../../generated/prisma/enums.js";
import { AuthEvents } from "../events/auth.events.js";
import { isValidEmail } from "../internal/utils/email.util.js";
import { AuthMainService } from "./auth-main-service.js";
import { TwoFactorAuthService } from "./2fa.service.js";
import { OtpAuthService } from "./otp.service.js";

export class AuthService extends AuthMainService implements IAuthService {
  private readonly twoFactorAuthService: TwoFactorAuthService;
  private readonly otpAuthService: OtpAuthService;

  constructor() {
    super();
    this.twoFactorAuthService = new TwoFactorAuthService();
    this.otpAuthService = new OtpAuthService();
  }

  async login(
    email: string,
    password: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<AuthResult> {
    try {
      const user = await this.userDbService.findUserWithRolesAndPermissions(
        email
      );

      if (!user) {
        this.events.emit(AuthEvents.LOGIN_FAILED, {
          email,
          reason: "User not found",
          ip: metadata?.ip,
          timestamp: new Date(),
        });
        throw new InvalidCredentialsException();
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        this.events.emit(AuthEvents.LOGIN_FAILED, {
          email,
          reason: "Account locked",
          ip: metadata?.ip,
          timestamp: new Date(),
        });
        throw new AccountLockedException(
          user.lockedUntil,
          this.config.maxLoginAttempts! - user.failedAttempts
        );
      }

      if (!user.isActive) {
        this.events.emit(AuthEvents.LOGIN_FAILED, {
          email,
          reason: "Account disabled",
          ip: metadata?.ip,
          timestamp: new Date(),
        });
        throw new AccountDisabledException();
      }

      const userMode = (user.loginSecurityMode as string)?.toLowerCase();
      if (userMode === "one_time_password") {
        this.events.emit(AuthEvents.LOGIN_FAILED, {
          email,
          reason: "One-time password required",
          ip: metadata?.ip,
          timestamp: new Date(),
        });
        throw new OtpRequiredException(
          "Dieser Account verwendet Einmalpasswort-Login. Bitte nutze den Einmalpasswort-Flow."
        );
      }

      // The hash is a globally omitted column and read only for this check
      const passwordHash = await this.userDbService.findPasswordHash(user.id);
      const isValidPassword = passwordHash
        ? await PasswordUtil.compare(password, passwordHash)
        : false;
      if (!isValidPassword) {
        await this.handleFailedLogin(user.id, email, metadata);
        throw new InvalidCredentialsException();
      }

      if (!user.emailVerified) {
        this.events.emit(AuthEvents.LOGIN_FAILED, {
          email,
          reason: "Email not verified",
          ip: metadata?.ip,
          timestamp: new Date(),
        });
        throw new EmailNotVerifiedException();
      }

      await this.resetFailedAttempts(user.id);

      const twoFactorStatus = await this.twoFactorService.getStatus(user.id);
      
      // If 2FA is already enabled, require code verification
      if (twoFactorStatus.enabled) {
        const tempToken = await this.tokenService.generateTempToken(user.id);

        // Backwards compatible event (not in AuthEvents enum)
        (this.events as any).emit("auth:2fa:required", {
          userId: user.id,
          timestamp: new Date(),
        });

        return {
          user: this.mapUserToDto(user),
          tokens: {
            accessToken: tempToken,
            refreshToken: "",
          },
          requiresTwoFactor: true,
        };
      }

      // If loginSecurityMode is TWO_FACTOR but 2FA not yet enabled, allow login but require setup
      const requiresSetup = user.loginSecurityMode === "two_factor" && !twoFactorStatus.enabled;

      const loginResult = await this.finalizeLoginForUser(user.id, metadata);
      
      if (requiresSetup) {
        return {
          ...loginResult,
          requires2FASetup: true,
        };
      }

      return loginResult;
    } catch (error) {
      this.logger.error("Login failed", { error, email });
      throw error;
    }
  }

  async logout(sessionId: string): Promise<void> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        return;
      }

      await this.sessionService.deleteSession(sessionId);

      this.events.emit(AuthEvents.USER_LOGOUT, {
        userId: session.userId,
        sessionId,
        timestamp: new Date(),
      });

      this.logger.info("User logged out", {
        userId: session.userId,
        sessionId,
      });
    } catch (error) {
      this.logger.error("Logout failed", { error, sessionId });
      throw error;
    }
  }

  async register(data: RegisterData): Promise<AuthResult> {
    try {
      if (!isValidEmail(data.email)) {
        throw new ValidationException("Invalid email format");
      }

      const passwordValidation = PasswordUtil.validateStrength(data.password);
      if (!passwordValidation.valid) {
        throw new ValidationException(passwordValidation.errors.join(", "));
      }

      const existingUser = await this.userDbService.findByEmail(data.email);
      if (existingUser) {
        throw new ValidationException("Email already registered");
      }

      const hashedPassword = await PasswordUtil.hash(data.password);

      const user = await this.userDbService.createUser({
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      const verifyToken = await this.generateEmailVerificationToken(user.id);

      if (this.emailSender?.sendEmailVerificationNotification) {
        await this.emailSender.sendEmailVerificationNotification(
          user.email,
          verifyToken
        );
      }

      this.events.emit(AuthEvents.USER_REGISTERED, {
        userId: user.id,
        email: user.email,
        timestamp: new Date(),
      });

      try {
        if (this.emailSender?.sendWelcomeNotification) {
          await this.emailSender.sendWelcomeNotification(user.email, "");
        }
      } catch (notifyError) {
        this.logger.warn("Failed to send welcome email", {
          notifyError,
          email: user.email,
        });
      }

      const sessionId = await this.sessionService.createSession(user.id);
      const tokens = await this.tokenService.generateTokenPair(user, sessionId);

      return {
        user: this.mapUserToDto(user),
        tokens,
      };
    } catch (error) {
      this.logger.error("Registration failed", { error, email: data.email });
      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);

      // Refresh tokens carry the user id in `sub` (string) and the session id
      const userId = Number.parseInt(String(payload.sub ?? ''), 10);
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
      if (Number.isNaN(userId) || !sessionId) {
        throw new InvalidTokenException("Invalid refresh token");
      }

      const user = await this.userDbService.findUserById(userId);
      if (!user) {
        throw new InvalidTokenException("User not found");
      }

      if (!user.isActive) {
        throw new AccountDisabledException();
      }

      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new InvalidTokenException("Session not found");
      }

      const tokens = await this.tokenService.generateTokenPair(user, sessionId);

      this.events.emit(AuthEvents.TOKEN_REFRESHED, {
        userId: user.id,
        sessionId: payload.sessionId,
        timestamp: new Date(),
      });

      return tokens;
    } catch (error) {
      this.logger.error("Token refresh failed", { error });
      throw error;
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await this.userDbService.findByEmail(email);
      if (!user) {
        return;
      }

      const resetToken = await this.generatePasswordResetToken(user.id);

      if (this.emailSender?.sendPasswordResetNotification) {
        await this.emailSender.sendPasswordResetNotification(
          user.email,
          resetToken
        );
      }

      this.events.emit(AuthEvents.PASSWORD_RESET_REQUESTED, {
        email: user.email,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error("Password reset request failed", { error, email });
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const passwordValidation = PasswordUtil.validateStrength(newPassword);
      if (!passwordValidation.valid) {
        throw new ValidationException(passwordValidation.errors.join(", "));
      }

      const user = await this.verifyPasswordResetToken(token);
      const hashedPassword = await PasswordUtil.hash(newPassword);

      await this.userDbService.updatePassword(user.id, hashedPassword);
      await this.userDbService.clearPasswordResetToken(user.id);
      await this.sessionService.deleteUserSessions(user.id);

      this.events.emit(AuthEvents.PASSWORD_RESET_COMPLETED, {
        userId: user.id,
        timestamp: new Date(),
      });

      this.logger.info("Password reset completed", { userId: user.id });
    } catch (error) {
      this.logger.error("Password reset failed", { error });
      throw error;
    }
  }

  /**
   * Setup initial password for new users
   */
  async setupPassword(token: string, newPassword: string, confirmPassword: string): Promise<void> {
    try {
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        throw new ValidationException("Passwords do not match");
      }

      // Validate password strength
      const passwordValidation = PasswordUtil.validateStrength(newPassword);
      if (!passwordValidation.valid) {
        throw new ValidationException(passwordValidation.errors.join(", "));
      }

      // Verify the setup token (reusing password reset token mechanism)
      const user = await this.verifyPasswordResetToken(token);
      
      // Hash the new password
      const hashedPassword = await PasswordUtil.hash(newPassword);

      // Update password and set loginSecurityMode to TWO_FACTOR
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          loginSecurityMode: AuthSecurityMode.TWO_FACTOR,
          emailVerified: true, // User verified email by clicking the setup link
          resetToken: null,
          resetTokenExpires: null,
          passwordChangedAt: new Date(),
        },
      });

      this.logger.info("Initial password setup completed", { userId: user.id });
    } catch (error) {
      this.logger.error("Password setup failed", { error });
      throw error;
    }
  }

  /**
   * Setup password for authenticated user (after OTP login)
   */
  async setupPasswordForAuthenticatedUser(
    userId: number,
    newPassword: string,
    confirmPassword: string
  ): Promise<void> {
    try {
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        throw new ValidationException("Passwords do not match");
      }

      // Validate password strength
      const passwordValidation = PasswordUtil.validateStrength(newPassword);
      if (!passwordValidation.valid) {
        throw new ValidationException(passwordValidation.errors.join(", "));
      }

      // Get user
      const user = await this.userDbService.findUserById(userId);
      if (!user) {
        throw new NotFoundException("User not found");
      }

      // Only allow if user is in ONE_TIME_PASSWORD mode
      if (user.loginSecurityMode?.toLowerCase() !== 'one_time_password') {
        throw new ValidationException("Password setup not allowed for this user");
      }

      // Hash the new password
      const hashedPassword = await PasswordUtil.hash(newPassword);

      // Update password and upgrade to TWO_FACTOR mode
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          loginSecurityMode: AuthSecurityMode.TWO_FACTOR,
          emailVerified: true,
          passwordChangedAt: new Date(),
        },
      });

      // Invalidate all sessions to force re-login with new password
      await this.sessionService.deleteUserSessions(userId);

      this.logger.info("Password setup completed for authenticated user", { userId });
    } catch (error) {
      this.logger.error("Authenticated password setup failed", { error, userId });
      throw error;
    }
  }

  async completeTwoFactorLogin(
    tempToken: string,
    verificationCode: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<AuthResult> {
    return this.twoFactorAuthService.completeTwoFactorLogin(
      tempToken,
      verificationCode,
      metadata
    );
  }

  async requestOneTimePassword(
    email: string
  ): Promise<OneTimePasswordRequestResult> {
    return this.otpAuthService.requestOneTimePassword(email);
  }

  async verifyOneTimePassword(
    input: OneTimePasswordVerifyInput
  ): Promise<AuthResult> {
    return this.otpAuthService.verifyOneTimePassword(input);
  }

  async verifyOneTimePasswordToken(
    token: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<AuthResult> {
    return this.otpAuthService.verifyOneTimePasswordToken(token, metadata);
  }

  async verifyEmail(token: string): Promise<void> {
    try {
      const user = await this.verifyEmailToken(token);
      await this.userDbService.markEmailAsVerified(user.id);

      this.events.emit(AuthEvents.EMAIL_VERIFIED, {
        userId: user.id,
        email: user.email,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error("Email verification failed", { error });
      throw error;
    }
  }

  async resendVerificationEmail(email: string): Promise<void> {
    try {
      const user = await this.userDbService.findByEmail(email);
      // Same generic outcome for unknown and already verified addresses, so
      // the endpoint cannot be used to enumerate accounts.
      if (!user || user.emailVerified) {
        return;
      }

      const verifyToken = await this.generateEmailVerificationToken(user.id);

      if (this.emailSender?.sendEmailVerificationNotification) {
        await this.emailSender.sendEmailVerificationNotification(
          user.email,
          verifyToken
        );
      }

      this.events.emit(AuthEvents.EMAIL_VERIFICATION_SENT, {
        userId: user.id,
        email: user.email,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error("Resend verification email failed", { error, email });
      throw error;
    }
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      await this.verifyUserPassword(userId, currentPassword);

      const validation = PasswordUtil.validateStrength(newPassword);
      if (!validation.valid) {
        throw new ValidationException(validation.errors.join(", "));
      }

      const hashedPassword = await PasswordUtil.hash(newPassword);
      await this.userDbService.updatePassword(userId, hashedPassword);

      this.events.emit(AuthEvents.PASSWORD_CHANGED, {
        userId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error("Change password failed", { error, userId });
      throw error;
    }
  }

  /**
   * Check user's authentication method by email
   * Returns the loginSecurityMode without requiring authentication
   */
  async checkUserAuthMethod(email: string): Promise<{
    loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
    emailExists: boolean;
  }> {
    try {
      if (!isValidEmail(email)) {
        throw new ValidationException('Invalid email format');
      }

      const user = await this.userDbService.findByEmail(email.trim().toLowerCase());
      
      if (!user) {
        // Return generic response to prevent email enumeration
        return {
          loginSecurityMode: 'none',
          emailExists: false,
        };
      }

      // Map database enum to response format
      const mode = (user.loginSecurityMode as string)?.toLowerCase();
      let loginSecurityMode: 'none' | 'two_factor' | 'one_time_password' = 'none';
      
      if (mode === 'one_time_password') {
        loginSecurityMode = 'one_time_password';
      } else if (mode === 'two_factor') {
        loginSecurityMode = 'two_factor';
      }

      this.logger.debug('User auth method checked', { 
        email: user.email, 
        mode: loginSecurityMode 
      });

      return {
        loginSecurityMode,
        emailExists: true,
      };
    } catch (error) {
      this.logger.error('Check user auth method failed', { error, email });
      throw error;
    }
  }

  async verifyUserPassword(userId: number, password: string): Promise<void> {

    const passwordHash = await this.userDbService.findPasswordHash(userId);
    if (!passwordHash) {
      throw new NotFoundException("User not found");
    }

    const isValid = await PasswordUtil.compare(password, passwordHash);
    if (!isValid) {
      throw new ValidationException("Invalid password");
    }
  }
}
