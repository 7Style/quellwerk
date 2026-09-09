import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import type {
  TwoFactorProvider,
  TwoFactorSetupData,
  TwoFactorVerifyResult,
} from '../provider.interface.js';
import { encrypt, decrypt, ValidationException } from '../../../../internal/index.js';
import { BaseAuthService } from '../../../base.service.js';

/** RFC 6238 defaults; stored base32 secrets stay compatible */
const TOTP_ALGORITHM = 'SHA1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
/** Accept one period of clock drift in each direction */
const TOTP_WINDOW = 1;
/** 160-bit secret as recommended by RFC 4226 */
const SECRET_SIZE = 20;

export class TotpProvider extends BaseAuthService implements TwoFactorProvider {
  private readonly APP_NAME: string;

  constructor() {
    super();
    this.APP_NAME = this.config.twoFactorIssuer || 'AuthModule';
  }

  getType(): string {
    return 'totp';
  }

  private createTotp(secret: Secret, label?: string): TOTP {
    return new TOTP({
      issuer: this.APP_NAME,
      label,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret,
    });
  }

  private isValidToken(base32Secret: string, token: string): boolean {
    const totp = this.createTotp(Secret.fromBase32(base32Secret));
    const delta = totp.validate({ token: token.replace(/\s+/g, ''), window: TOTP_WINDOW });
    return delta !== null;
  }

  /**
   * Generate TOTP setup data
   */
  async generateSetup(userId: number): Promise<TwoFactorSetupData> {
    try {
      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user) {
        throw new ValidationException('User not found');
      }

      // Generate secret and otpauth:// URI
      const secret = new Secret({ size: SECRET_SIZE });
      const totp = this.createTotp(secret, user.email);

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(totp.toString());

      // Encrypt secret for storage
      const encryptedSecret = encrypt(secret.base32);

      // Store temporary secret
      const tempSecretExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await this.prisma.twoFactorAuth.upsert({
        where: { userId },
        create: {
          userId,
          type: 'totp',
          tempSecret: encryptedSecret,
          tempSecretExpires,
        },
        update: {
          tempSecret: encryptedSecret,
          tempSecretExpires,
        },
      });

      this.logger.info('TOTP setup generated', { userId });

      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32,
        metadata: {
          algorithm: TOTP_ALGORITHM.toLowerCase(),
          digits: TOTP_DIGITS,
          period: TOTP_PERIOD,
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate TOTP setup', { error, userId });
      throw error;
    }
  }

  /**
   * Verify setup token and enable TOTP
   */
  async verifySetup(userId: number, token: string): Promise<TwoFactorVerifyResult> {
    try {
      // Get temporary secret (globally omitted column, opted in here only)
      const twoFactorAuth = await this.prisma.twoFactorAuth.findUnique({
        where: { userId },
        omit: { tempSecret: false },
      });

      if (!twoFactorAuth?.tempSecret) {
        throw new ValidationException('Two-factor setup not found');
      }

      if (twoFactorAuth.tempSecretExpires && twoFactorAuth.tempSecretExpires < new Date()) {
        throw new ValidationException('Setup has expired');
      }

      // Decrypt and verify (validate with a drift window, no code comparison)
      const decryptedSecret = decrypt(twoFactorAuth.tempSecret);
      const isValid = this.isValidToken(decryptedSecret, token);

      if (isValid) {
        // Move temp secret to permanent and mark as verified
        await this.prisma.twoFactorAuth.update({
          where: { userId },
          data: {
            secret: twoFactorAuth.tempSecret,
            tempSecret: null,
            tempSecretExpires: null,
            verifiedAt: new Date(),
          },
        });

        // Update user's loginSecurityMode to TWO_FACTOR
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            loginSecurityMode: 'TWO_FACTOR',
          },
        });

        this.logger.info('TOTP setup verified', { userId });
      }

      return {
        isValid,
        attemptsRemaining: isValid ? undefined : 3,
      };
    } catch (error) {
      this.logger.error('Failed to verify TOTP setup', { error, userId });
      throw error;
    }
  }

  /**
   * Verify TOTP token during login
   */
  async verify(userId: number, token: string): Promise<TwoFactorVerifyResult> {
    try {
      // Get user's TOTP secret (globally omitted column, opted in here only)
      const twoFactorAuth = await this.prisma.twoFactorAuth.findUnique({
        where: { userId },
        omit: { secret: false },
      });

      if (!twoFactorAuth?.secret || !twoFactorAuth.verifiedAt) {
        throw new ValidationException('Two-factor authentication not enabled');
      }

      // Decrypt and verify
      const decryptedSecret = decrypt(twoFactorAuth.secret);
      const isValid = this.isValidToken(decryptedSecret, token);

      if (isValid) {
        // Update last used
        await this.prisma.twoFactorAuth.update({
          where: { userId },
          data: { lastUsed: new Date() },
        });
      }

      this.logger.debug('TOTP verification', { userId, isValid });

      return {
        isValid,
        attemptsRemaining: 5, // TODO: Track actual attempts
      };
    } catch (error) {
      this.logger.error('Failed to verify TOTP', { error, userId });
      throw error;
    }
  }
}
