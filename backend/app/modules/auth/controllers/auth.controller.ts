import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  SetupPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  CheckEmailDto,
  OneTimePasswordRequestDto,
  OneTimePasswordVerifyDto,
  OneTimePasswordTokenDto,
} from '../dto/auth.dto.js';
import {
  TwoFactorSetupDto,
  TwoFactorVerifySetupDto,
  TwoFactorVerifyDto,
  TwoFactorDisableDto,
  GenerateBackupCodesDto,
} from '../dto/two-factor.dto.js';
import { ValidationException, ForbiddenException } from '../internal/index.js';
import { isValidEmail } from '../internal/utils/email.util.js';

export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * User login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as LoginDto;
      
      // Validate input
      if (!dto.email || !dto.password) {
        throw new ValidationException('Email and password are required');
      }

      const metadata = {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await this.authService.login(dto.email, dto.password, metadata);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check user's authentication method by email
   */
  async checkEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as CheckEmailDto;
      
      // Validate input
      if (!dto.email) {
        throw new ValidationException('Email is required');
      }

      const result = await this.authService.checkUserAuthMethod(dto.email);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }


  /**
   * User logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.user?.sessionId;
      
      if (sessionId) {
        await this.authService.logout(sessionId);
      }

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * User registration
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as RegisterDto;
      
      // Validate input
      if (!dto.email || !dto.password) {
        throw new ValidationException('Email and password are required');
      }

      if (!isValidEmail(dto.email)) {
        throw new ValidationException('Invalid email format');
      }

      const result = await this.authService.register({
        email: dto.email,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as RefreshTokenDto;
      
      if (!dto.refreshToken) {
        throw new ValidationException('Refresh token is required');
      }

      const tokens = await this.authService.refreshToken(dto.refreshToken);

      res.json({
        success: true,
        data: { tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as RequestPasswordResetDto;
      
      if (!dto.email) {
        throw new ValidationException('Email is required');
      }

      await this.authService.requestPasswordReset(dto.email);

      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as ResetPasswordDto;
      
      if (!dto.token || !dto.newPassword) {
        throw new ValidationException('Token and new password are required');
      }

      await this.authService.resetPassword(dto.token, dto.newPassword);

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Setup initial password
   * Supports both token-based (email link) and session-based (after OTP login)
   */
  async setupPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as SetupPasswordDto;
      
      // Validate input
      if (!dto.newPassword || !dto.confirmPassword) {
        throw new ValidationException('New password and confirmation are required');
      }

      // Check if token-based or session-based
      if (dto.token) {
        // Token-based setup (from email link)
        await this.authService.setupPassword(dto.token, dto.newPassword, dto.confirmPassword);
      } else if (req.user?.id) {
        // Session-based setup (authenticated user after OTP login)
        await this.authService.setupPasswordForAuthenticatedUser(
          req.user.id,
          dto.newPassword,
          dto.confirmPassword
        );
      } else {
        throw new ValidationException('Either token or authenticated session is required');
      }

      res.json({
        success: true,
        message: 'Password setup successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password (authenticated)
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const dto = (req.body ?? {}) as ChangePasswordDto;

      if (!dto.currentPassword || !dto.newPassword) {
        throw new ValidationException('Current password and new password are required');
      }

      await this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as VerifyEmailDto;
      
      if (!dto.token) {
        throw new ValidationException('Verification token is required');
      }

      await this.authService.verifyEmail(dto.token);

      res.json({
        success: true,
        message: 'Email verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as ResendVerificationDto;
      
      if (!dto.email) {
        throw new ValidationException('Email is required');
      }

      await this.authService.resendVerificationEmail(dto.email);

      res.json({
        success: true,
        message: 'Verification email sent',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      
      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // --- Two-Factor Authentication ---

  /**
   * Setup 2FA
   */
  async setup2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const dto = (req.body ?? {}) as TwoFactorSetupDto;
      
      if (!dto.password) {
        throw new ValidationException('Password is required');
      }

      // Verify password without creating sessions/tokens
      await this.authService.verifyUserPassword(userId, dto.password);

      const result = await this.authService.getTwoFactorService().setupTwoFactor(
        userId,
        dto.type || 'totp'
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify 2FA setup
   */
  async verify2FASetup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const dto = (req.body ?? {}) as TwoFactorVerifySetupDto;
      
      if (!dto.token) {
        throw new ValidationException('Verification token is required');
      }

      const { backupCodes } = await this.authService
        .getTwoFactorService()
        .verifySetup(userId, dto.token);

      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully',
        data: { backupCodes },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify 2FA during login
   */
  async verify2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as TwoFactorVerifyDto;

      if (!dto.token || !dto.tempToken) {
        throw new ValidationException('Temp token and verification code are required');
      }

      const metadata = {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await this.authService.completeTwoFactorLogin(
        dto.tempToken,
        dto.token,
        metadata
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request one-time password login code
   */
  async requestOneTimePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as OneTimePasswordRequestDto;

      if (!dto.email) {
        throw new ValidationException('Email is required');
      }

      const result = await this.authService.requestOneTimePassword(dto.email);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify one-time password code
   */
  async verifyOneTimePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as OneTimePasswordVerifyDto;

      if (!dto.challengeToken || !dto.code) {
        throw new ValidationException('Challenge token and code are required');
      }

      const metadata = {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await this.authService.verifyOneTimePassword({
        challengeToken: dto.challengeToken,
        code: dto.code,
        rememberDevice: dto.rememberDevice,
        metadata,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify one-time password deep-link token
   */
  async verifyOneTimePasswordToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = (req.body ?? {}) as OneTimePasswordTokenDto;

      if (!dto.token) {
        throw new ValidationException('Token is required');
      }

      const metadata = {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await this.authService.verifyOneTimePasswordToken(dto.token, metadata);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get 2FA status
   */
  async get2FAStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const status = await this.authService.getTwoFactorService().getStatus(userId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Disable 2FA
   */
  async disable2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const dto = (req.body ?? {}) as TwoFactorDisableDto;
      
      if (!dto.password) {
        throw new ValidationException('Password is required');
      }

      // Verify password without creating sessions/tokens
      await this.authService.verifyUserPassword(userId, dto.password);

      await this.authService.getTwoFactorService().disableTwoFactor(userId);

      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate new backup codes
   */
  async generateBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const dto = (req.body ?? {}) as GenerateBackupCodesDto;
      
      if (!dto.password) {
        throw new ValidationException('Password is required');
      }

      // Verify password without creating sessions/tokens
      await this.authService.verifyUserPassword(userId, dto.password);

      const codes = await this.authService.getTwoFactorService().generateBackupCodes(userId);

      res.json({
        success: true,
        data: { backupCodes: codes },
      });
    } catch (error) {
      next(error);
    }
  }


  /**
   * Get user sessions
   */
  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const sessions = await this.authService.getSessionService().getUserSessions(userId);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Terminate other sessions
   */
  async terminateOtherSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const currentSessionId = req.user!.sessionId;

      const count = await this.authService.getSessionService().terminateOtherSessions(
        userId,
        currentSessionId || ''
      );

      res.json({
        success: true,
        message: `Terminated ${count} other sessions`,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Reset 2FA for a user
   */
  async adminResetTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = Number.parseInt(String(req.params.userId ?? ''), 10);
      
      if (isNaN(targetUserId)) {
        throw new ValidationException('Invalid user ID');
      }

      // Check if requesting user has admin permissions
      const permissions = req.user!.permissions || [];
      if (!permissions.includes('auth:admin:reset2fa')) {
        throw new ForbiddenException('Insufficient permissions to reset 2FA');
      }

      await this.authService.getTwoFactorService().adminReset(targetUserId, req.user!.id);

      res.json({
        success: true,
        message: '2FA has been reset for the user',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forgot password (alias for requestPasswordReset)
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.requestPasswordReset(req, res, next);
  }

  /**
   * Resend verification (alias for resendVerificationEmail)
   */
  async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.resendVerificationEmail(req, res, next);
  }
}
