import { AuthResult } from '../interfaces/module.interface.js';
import {
  ValidationException,
  AccountDisabledException,
  NotFoundException,
} from '../internal/index.js';
import { AuthMainService } from './auth-main-service.js';

export class TwoFactorAuthService extends AuthMainService {
  async completeTwoFactorLogin(
    tempToken: string,
    verificationCode: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<AuthResult> {
    const { userId } = await this.tokenService.verifyTempToken(tempToken);

    const user = await this.userDbService.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new AccountDisabledException();
    }

    // Only the verified secret (or an unused backup code) completes the login.
    // A pending tempSecret from a setup that was never confirmed is not a
    // second factor and must not be accepted here.
    const valid = await this.twoFactorService.verifyLogin(userId, verificationCode);

    if (!valid) {
      throw new ValidationException('Invalid verification code');
    }

    return this.finalizeLoginForUser(userId, metadata, {
      allowedModes: ['two_factor', 'none'],
    });
  }
}
