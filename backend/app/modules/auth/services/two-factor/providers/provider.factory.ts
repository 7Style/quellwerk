import { TwoFactorProvider, TwoFactorProviderType } from './provider.interface.js';
import { TotpProvider } from './totp/totp.provider.js';
import { logger } from '../../../internal/utils/logger.util.js';

/**
 * Factory for creating Two-Factor Authentication providers
 */
export class TwoFactorProviderFactory {
  /**
   * Create a provider instance based on type
   */
  static create(
    type: string
  ): TwoFactorProvider {
    logger.debug('Creating 2FA provider', { type });

    switch (type.toLowerCase()) {
      case TwoFactorProviderType.TOTP:
        return new TotpProvider(); // Holt sich prisma und config automatisch aus BaseAuthService

      case TwoFactorProviderType.SMS:
        // TODO: Implement SMS provider
        throw new Error('SMS provider not yet implemented');

      case TwoFactorProviderType.EMAIL:
        // TODO: Implement Email provider
        throw new Error('Email provider not yet implemented');

      default:
        throw new Error(`Unsupported 2FA provider type: ${type}`);
    }
  }

  /**
   * Get list of supported provider types
   */
  static getSupportedTypes(): string[] {
    return [
      TwoFactorProviderType.TOTP,
      // Uncomment when implemented:
      // TwoFactorProviderType.SMS,
      // TwoFactorProviderType.EMAIL,
    ];
  }

  /**
   * Check if a provider type is supported
   */
  static isSupported(type: string): boolean {
    return this.getSupportedTypes().includes(type.toLowerCase());
  }
}
