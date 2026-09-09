import { randomBytes } from 'node:crypto';
import { BaseAuthService } from '../base.service.js';
import { PasswordUtil } from '../../internal/utils/password.util.js';

export class BackupCodesService extends BaseAuthService {
  private readonly BACKUP_CODE_COUNT = 8;
  private readonly BACKUP_CODE_LENGTH = 8;

  constructor() {
    super();
    // prisma ist jetzt über this.prisma verfügbar
  }

  /**
   * Generate new backup codes for user
   */
  async generateBackupCodes(userId: number): Promise<string[]> {
    const codes: string[] = [];
    const hashedCodes: Array<{ userId: number; code: string }> = [];

    // Generate codes
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      const code = this.generateCode();
      codes.push(code);

      // Hash code for storage (bcrypt cost from the module config, same as passwords)
      const hashedCode = await PasswordUtil.hash(code);
      hashedCodes.push({
        userId,
        code: hashedCode,
      });
    }

    // Store hashed codes
    await this.prisma.twoFactorBackupCode.createMany({
      data: hashedCodes,
    });

    this.logger.info('Generated backup codes', { userId, count: codes.length });
    return codes;
  }

  /**
   * Verify and use a backup code
   */
  async verifyAndUseBackupCode(userId: number, code: string): Promise<boolean> {
    // Get unused backup codes (the hashed code is a globally omitted column)
    const backupCodes = await this.prisma.twoFactorBackupCode.findMany({
      where: {
        userId,
        usedAt: null,
      },
      omit: { code: false },
    });

    // Check each code
    for (const backupCode of backupCodes) {
      const isValid = await PasswordUtil.compare(code, backupCode.code);
      if (isValid) {
        // Mark as used
        await this.prisma.twoFactorBackupCode.update({
          where: { id: backupCode.id },
          data: { usedAt: new Date() },
        });

        this.logger.info('Backup code used', { userId, codeId: backupCode.id });
        return true;
      }
    }

    return false;
  }

  /**
   * Get remaining backup codes count
   */
  async getRemainingBackupCodesCount(userId: number): Promise<number> {
    const count = await this.prisma.twoFactorBackupCode.count({
      where: {
        userId,
        usedAt: null,
      },
    });

    return count;
  }

  /**
   * Delete all backup codes for user
   */
  async deleteAllBackupCodes(userId: number): Promise<void> {
    await this.prisma.twoFactorBackupCode.deleteMany({
      where: { userId },
    });

    this.logger.info('Deleted all backup codes', { userId });
  }

  /**
   * Generate a single backup code
   */
  private generateCode(): string {
    const bytes = randomBytes(this.BACKUP_CODE_LENGTH);
    const code = bytes.toString('hex').toUpperCase();
    
    // Format as XXXX-XXXX
    return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
  }
}
