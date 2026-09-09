import {
  ITwoFactorService,
  TwoFactorSetupResult,
  TwoFactorStatus,
  TwoFactorVerifySetupResult,
} from "../../interfaces/module.interface.js";
import { TwoFactorProviderFactory } from "./providers/provider.factory.js";
import { BackupCodesService } from "./backup-codes.service.js";
import { ValidationException } from "../../internal/index.js";
import { EmailService as ModuleEmailService } from "../email-notifications/email-service.js";
import { BaseAuthService } from "../base.service.js";

export class TwoFactorService
  extends BaseAuthService
  implements ITwoFactorService
{
  private backupCodesService: BackupCodesService;
  private emailService?: ModuleEmailService;

  constructor(emailService?: ModuleEmailService) {
    super();
    this.emailService = emailService;
    this.backupCodesService = new BackupCodesService(); // Holt sich prisma automatisch aus BaseAuthService
  }

  /**
   * Setup two-factor authentication for user
   */
  async setupTwoFactor(
    userId: number,
    type: string = "totp"
  ): Promise<TwoFactorSetupResult> {
    try {
      // Re-setup while 2FA is active is allowed: the provider stores a new
      // tempSecret, the verified secret stays valid until verifySetup succeeds.
      // No backup codes are created here: they would let the caller pass the
      // second factor before the authenticator was ever confirmed. They are
      // issued by verifySetup.
      const provider = TwoFactorProviderFactory.create(type);
      const setupData = await provider.generateSetup(userId);

      this.logger.info("2FA setup initiated", { userId, type });

      return {
        secret: setupData.secret,
        qrCode: setupData.qrCode || "",
        manualEntryKey: setupData.manualEntryKey || setupData.secret,
      };
    } catch (error) {
      this.logger.error("2FA setup failed", { error, userId });
      throw error;
    }
  }

  /**
   * Verify the setup code, enable 2FA and issue a fresh set of backup codes
   * (previous codes are deleted first, so a re-setup invalidates old codes).
   */
  async verifySetup(userId: number, token: string): Promise<TwoFactorVerifySetupResult> {
    try {
      // Get 2FA record
      const twoFactorAuth = await this.prisma.twoFactorAuth.findUnique({
        where: { userId },
      });

      if (!twoFactorAuth) {
        throw new ValidationException("Two-factor setup not found");
      }

      // Re-Setup ist erlaubt: wenn bereits enabled, wird beim erfolgreichen Verify die secret aus tempSecret übernommen.

      // Get provider
      const provider = TwoFactorProviderFactory.create(twoFactorAuth.type);

      // Verify setup
      const result = await provider.verifySetup(userId, token);

      if (!result.isValid) {
        throw new ValidationException("Invalid verification code");
      }

      await this.backupCodesService.deleteAllBackupCodes(userId);
      const backupCodes = await this.backupCodesService.generateBackupCodes(userId);

      this.logger.info("2FA enabled", { userId });

      // Notify user via module email service
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (
          user?.email &&
          this.emailService?.sendTwoFactorEnabledNotification
        ) {
          await this.emailService.sendTwoFactorEnabledNotification(
            user.email,
            ""
          );
        }
      } catch (notifyError) {
        this.logger.warn("Failed sending 2FA enabled email", {
          notifyError,
          userId,
        });
      }

      return { backupCodes };
    } catch (error) {
      this.logger.error("2FA setup verification failed", { error, userId });
      throw error;
    }
  }

  /**
   * Verify 2FA code during login
   */
  async verifyLogin(userId: number, token: string): Promise<boolean> {
    try {
      // Check if 2FA is enabled
      const twoFactorAuth = await this.prisma.twoFactorAuth.findUnique({
        where: { userId },
      });

      if (!twoFactorAuth?.verifiedAt) {
        throw new ValidationException(
          "Two-factor authentication is not enabled"
        );
      }

      // Try backup code first
      const isBackupCode = await this.backupCodesService.verifyAndUseBackupCode(
        userId,
        token
      );

      if (isBackupCode) {
        this.logger.info("2FA login with backup code", { userId });
        return true;
      }

      // Get provider
      const provider = TwoFactorProviderFactory.create(twoFactorAuth.type);

      // Verify token
      const result = await provider.verify(userId, token);

      if (!result.isValid) {
        this.logger.warn("Invalid 2FA code", { userId });
        return false;
      }

      // Update last used
      await this.prisma.twoFactorAuth.update({
        where: { userId },
        data: { lastUsed: new Date() },
      });

      this.logger.info("2FA login verified", { userId });
      return true;
    } catch (error) {
      this.logger.error("2FA login verification failed", { error, userId });
      return false;
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(userId: number): Promise<void> {
    try {
      // Delete 2FA record
      await this.prisma.twoFactorAuth.delete({
        where: { userId },
      });

      // Delete backup codes
      await this.backupCodesService.deleteAllBackupCodes(userId);

      // Update user's loginSecurityMode back to NONE
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          loginSecurityMode: "NONE",
        },
      });

      this.logger.info("2FA disabled", { userId });

      // Notify user via module email service
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (
          user?.email &&
          this.emailService?.sendTwoFactorDisabledNotification
        ) {
          await this.emailService.sendTwoFactorDisabledNotification(
            user.email,
            ""
          );
        }
      } catch (notifyError) {
        this.logger.warn("Failed sending 2FA disabled email", {
          notifyError,
          userId,
        });
      }
    } catch {
      // Record might not exist
      this.logger.debug("2FA disable - record not found", { userId });
    }
  }

  /**
   * Generate new backup codes
   */
  async generateBackupCodes(userId: number): Promise<string[]> {
    try {
      // Check if 2FA is enabled
      const twoFactorAuth = await this.prisma.twoFactorAuth.findUnique({
        where: { userId },
      });

      if (!twoFactorAuth?.verifiedAt) {
        throw new ValidationException(
          "Two-factor authentication is not enabled"
        );
      }

      // Delete old backup codes
      await this.backupCodesService.deleteAllBackupCodes(userId);

      // Generate new codes
      const codes = await this.backupCodesService.generateBackupCodes(userId);

      this.logger.info("New backup codes generated", {
        userId,
        count: codes.length,
      });
      return codes;
    } catch (error) {
      this.logger.error("Backup code generation failed", { error, userId });
      throw error;
    }
  }

  /**
   * Get 2FA status for user
   */
  async getStatus(userId: number): Promise<TwoFactorStatus> {
    try {
      const twoFactorAuth = await this.prisma.twoFactorAuth.findUnique({
        where: { userId },
      });

      if (!twoFactorAuth?.verifiedAt) {
        return {
          enabled: false,
        };
      }

      const backupCodesCount =
        await this.backupCodesService.getRemainingBackupCodesCount(userId);

      return {
        enabled: true,
        type: twoFactorAuth.type,
        backupCodesRemaining: backupCodesCount,
      };
    } catch (error) {
      this.logger.error("Failed to get 2FA status", { error, userId });
      return {
        enabled: false,
      };
    }
  }

  /**
   * Admin reset - disable 2FA for a user
   */
  async adminReset(userId: number, adminId: number): Promise<void> {
    try {
      await this.disableTwoFactor(userId);

      this.logger.warn("2FA admin reset", { userId, adminId });

      // Create audit log if adapter is configured
      if (this.config.auditAdapter) {
        await this.config.auditAdapter.log({
          action: "TWO_FACTOR_ADMIN_RESET",
          userId: adminId,
          metadata: { targetUserId: userId },
        });
      }
    } catch (error) {
      this.logger.error("2FA admin reset failed", { error, userId, adminId });
      throw error;
    }
  }
}
