import { BaseAuthService } from "../base.service.js";
import { EmailService as ModuleEmailService } from "../email-notifications/email-service.js";
import {
  ValidationException,
  CryptoUtil,
  TokenUtil,
} from "../../internal/index.js";
import {
  AuthSecurityMode,
  OneTimePasswordChallenge,
} from "../../interfaces/module.interface.js";
import crypto from "node:crypto";

interface OneTimePasswordSettings {
  codeLength: number;
  expiresInMinutes: number;
  resendCooldownSeconds: number;
  maxVerificationAttempts: number;
}

const DEFAULT_SETTINGS: OneTimePasswordSettings = {
  codeLength: 6,
  expiresInMinutes: 10,
  resendCooldownSeconds: 60,
  maxVerificationAttempts: 5,
};

function generateNumericCode(length: number): string {
  const digits: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const rand = crypto.randomInt(0, 10);
    digits.push(rand.toString());
  }
  return digits.join("");
}

function ensureTrailingSlashRemoved(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export class OneTimePasswordService extends BaseAuthService {
  private emailService?: ModuleEmailService;

  constructor(emailService?: ModuleEmailService) {
    super();
    this.emailService = emailService;
  }

  private get otpModel() {
    return (this.prisma as any).oneTimePasswordLogin;
  }

  private resolveSettings(): OneTimePasswordSettings {
    const custom = this.config.oneTimePassword || {};
    return {
      codeLength:
        custom.codeLength && custom.codeLength > 3
          ? custom.codeLength
          : DEFAULT_SETTINGS.codeLength,
      expiresInMinutes:
        custom.expiresInMinutes && custom.expiresInMinutes > 0
          ? custom.expiresInMinutes
          : DEFAULT_SETTINGS.expiresInMinutes,
      resendCooldownSeconds:
        custom.resendCooldownSeconds && custom.resendCooldownSeconds >= 0
          ? custom.resendCooldownSeconds
          : DEFAULT_SETTINGS.resendCooldownSeconds,
      maxVerificationAttempts:
        custom.maxVerificationAttempts && custom.maxVerificationAttempts > 0
          ? custom.maxVerificationAttempts
          : DEFAULT_SETTINGS.maxVerificationAttempts,
    };
  }

  private buildDeepLinkUrl(token: string): string {
    const baseUrl = this.config.frontendUrl || "http://localhost:3010";
    const normalizedBase = ensureTrailingSlashRemoved(baseUrl);
    return `${normalizedBase}/otp-login.html?token=${token}`;
  }

  async cleanupExpired(): Promise<void> {
    const now = new Date();
    await this.otpModel.updateMany({
      where: {
        consumedAt: null,
        expiresAt: { lt: now },
      },
      data: {
        consumedAt: now,
      },
    });
  }

  async createChallenge(user: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    loginSecurityMode: AuthSecurityMode;
    preferredLanguage?: string;
  }): Promise<OneTimePasswordChallenge> {
    const userMode = (user.loginSecurityMode as string)?.toLowerCase();
    if (userMode !== "one_time_password") {
      throw new ValidationException(
        "One-time password login ist für diesen Nutzer nicht aktiviert."
      );
    }

    const settings = this.resolveSettings();
    const now = new Date();

    await this.cleanupExpired();

    const recent = await this.otpModel.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (recent) {
      const diffMs = now.getTime() - recent.createdAt.getTime();
      if (diffMs < settings.resendCooldownSeconds * 1000) {
        throw new ValidationException(
          "Bitte warte einen Moment, bevor du einen neuen Code anforderst."
        );
      }

      // Make sure previous challenges cannot be reused
      await this.otpModel.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });
    }

    const challengeToken = TokenUtil.generateUuid();
    const rawCode = generateNumericCode(settings.codeLength);
    const deepLinkToken = TokenUtil.generateRandomToken(16);
    const expiresAt = new Date(
      now.getTime() + settings.expiresInMinutes * 60 * 1000
    );

    const record = await this.otpModel.create({
      data: {
        userId: user.id,
        challengeToken,
        codeHash: CryptoUtil.hash(rawCode),
        deepLinkHash: CryptoUtil.hash(deepLinkToken),
        expiresAt,
      },
    });

    if (!this.emailService) {
      this.logger.error("OTP email service not configured");
      throw new ValidationException(
        "E-Mail Versand für Einmalpasswort ist nicht verfügbar."
      );
    }

    try {
      await this.emailService.sendOneTimePasswordCode(
        user.email,
        rawCode,
        this.buildDeepLinkUrl(deepLinkToken)
      );
    } catch (error) {
      this.logger.error("Failed to send one-time password email", {
        error,
        userId: user.id,
      });
      await this.otpModel.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      throw new ValidationException(
        "Einmalpasswort konnte nicht per E-Mail zugestellt werden."
      );
    }

    return {
      challengeToken,
      expiresAt,
      delivered: true,
      deliveryMethod: "email",
    };
  }

  async verifyCode(
    challengeToken: string,
    code: string
  ): Promise<{ userId: number }> {
    const settings = this.resolveSettings();
    const record = await this.otpModel.findUnique({
      where: { challengeToken },
    });

    if (!record) {
      throw new ValidationException(
        "Ungültige oder abgelaufene Login-Anfrage."
      );
    }

    const now = new Date();
    if (record.consumedAt) {
      throw new ValidationException("Dieser Code wurde bereits verwendet.");
    }

    if (record.expiresAt <= now) {
      await this.otpModel.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      throw new ValidationException("Dieser Code ist abgelaufen.");
    }

    if (record.attempts >= settings.maxVerificationAttempts) {
      await this.otpModel.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      throw new ValidationException(
        "Zu viele ungültige Versuche. Bitte fordere einen neuen Code an."
      );
    }

    const isValid = CryptoUtil.compareHash(code, record.codeHash);
    if (!isValid) {
      const updated = await this.otpModel.update({
        where: { id: record.id },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      if (updated.attempts >= settings.maxVerificationAttempts) {
        await this.otpModel.update({
          where: { id: record.id },
          data: { consumedAt: now },
        });
      }

      throw new ValidationException("Der eingegebene Code ist ungültig.");
    }

    await this.otpModel.update({
      where: { id: record.id },
      data: {
        consumedAt: now,
        attempts: record.attempts + 1,
      },
    });

    return { userId: record.userId };
  }

  async verifyDeepLink(token: string): Promise<{ userId: number }> {
    const hash = CryptoUtil.hash(token);
    const record = await this.otpModel.findFirst({
      where: {
        deepLinkHash: hash,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      throw new ValidationException("Ungültiger oder abgelaufener Login-Link.");
    }

    const now = new Date();
    if (record.expiresAt <= now) {
      await this.otpModel.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      throw new ValidationException("Der Login-Link ist abgelaufen.");
    }

    await this.otpModel.update({
      where: { id: record.id },
      data: {
        consumedAt: now,
        attempts: record.attempts + 1,
      },
    });

    return { userId: record.userId };
  }

  async markConsumed(challengeToken: string): Promise<void> {
    await this.otpModel.updateMany({
      where: { challengeToken },
      data: { consumedAt: new Date() },
    });
  }
}
