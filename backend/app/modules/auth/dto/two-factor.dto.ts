/**
 * Data Transfer Objects for Two-Factor Authentication
 */

/**
 * Setup 2FA request DTO
 */
export interface TwoFactorSetupDto {
  type?: 'totp' | 'sms' | 'email';
  password: string; // Require password to enable 2FA
}

/**
 * Verify 2FA setup DTO
 */
export interface TwoFactorVerifySetupDto {
  token: string;
}

/**
 * Verify 2FA login DTO
 */
export interface TwoFactorVerifyDto {
  userId?: number; // Optional, can be extracted from temp token
  token: string;
  tempToken?: string; // Temporary token from login
}

/**
 * Disable 2FA DTO
 */
export interface TwoFactorDisableDto {
  password: string; // Require password to disable 2FA
}

/**
 * Generate backup codes DTO
 */
export interface GenerateBackupCodesDto {
  password: string; // Require password to regenerate codes
}

/**
 * 2FA setup response DTO (no backup codes until the setup is verified)
 */
export interface TwoFactorSetupResponseDto {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
}

/**
 * 2FA verify-setup response DTO: the freshly issued backup codes
 */
export interface TwoFactorVerifySetupResponseDto {
  backupCodes: string[];
}

/**
 * 2FA status response DTO
 */
export interface TwoFactorStatusResponseDto {
  enabled: boolean;
  type?: string;
  backupCodesRemaining?: number;
  lastUsed?: Date;
}

/**
 * Admin reset 2FA DTO
 */
export interface TwoFactorAdminResetDto {
  targetUserId: number;
  reason?: string;
}
