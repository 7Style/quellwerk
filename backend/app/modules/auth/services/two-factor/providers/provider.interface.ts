/**
 * Interface for all Two-Factor Authentication providers
 */
export interface TwoFactorProvider {
  /**
   * Generate setup data for enabling 2FA
   */
  generateSetup(userId: number): Promise<TwoFactorSetupData>;

  /**
   * Verify the setup token and enable 2FA
   */
  verifySetup(userId: number, token: string): Promise<TwoFactorVerifyResult>;

  /**
   * Verify a 2FA token during login
   */
  verify(userId: number, token: string): Promise<TwoFactorVerifyResult>;

  /**
   * Get provider type
   */
  getType(): string;
}

/**
 * Data returned when setting up 2FA
 */
export interface TwoFactorSetupData {
  /**
   * Secret key (for TOTP, this is the base32 secret)
   */
  secret: string;

  /**
   * QR code data URL (for TOTP)
   */
  qrCode?: string;

  /**
   * Manual entry key (for TOTP)
   */
  manualEntryKey?: string;

  /**
   * Additional provider-specific data
   */
  metadata?: Record<string, any>;
}

/**
 * Result of verifying a 2FA token
 */
export interface TwoFactorVerifyResult {
  /**
   * Whether the token is valid
   */
  isValid: boolean;

  /**
   * Number of remaining attempts (if applicable)
   */
  attemptsRemaining?: number;

  /**
   * Additional provider-specific data
   */
  metadata?: Record<string, any>;
}

/**
 * Provider types enum
 */
export enum TwoFactorProviderType {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email',
}
