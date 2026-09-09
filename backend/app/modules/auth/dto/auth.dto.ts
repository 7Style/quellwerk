/**
 * Data Transfer Objects for Authentication
 */

/**
 * Login request DTO
 */
export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Register request DTO
 */
export interface RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  acceptTerms?: boolean;
}

/**
 * Refresh token request DTO
 */
export interface RefreshTokenDto {
  refreshToken: string;
}

/**
 * Request password reset DTO
 */
export interface RequestPasswordResetDto {
  email: string;
}

/**
 * Reset password DTO
 */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

/**
 * Setup password DTO
 * Supports both token-based (email link) and session-based (authenticated user)
 */
export interface SetupPasswordDto {
  token?: string; // Optional - for email link flow
  newPassword: string;
  confirmPassword: string;
}

/**
 * Change password DTO (for authenticated users)
 */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

/**
 * Verify email DTO
 */
export interface VerifyEmailDto {
  token: string;
}

/**
 * Resend verification email DTO
 */
export interface ResendVerificationDto {
  email: string;
}

/**
 * Check email DTO - for checking user's authentication method
 */
export interface CheckEmailDto {
  email: string;
}

/**
 * Check email response DTO
 */
export interface CheckEmailResponseDto {
  loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
  emailExists: boolean;
}


export interface OneTimePasswordRequestDto {
  email: string;
}

export interface OneTimePasswordVerifyDto {
  challengeToken: string;
  code: string;
  rememberDevice?: boolean;
}

export interface OneTimePasswordTokenDto {
  token: string;
}

/**
 * Auth response DTO
 */
export interface AuthResponseDto {
  user: CurrentUserDto;
  tokens: TokenResponseDto;
  requiresTwoFactor?: boolean;
}

/**
 * Current user DTO
 */
export interface CurrentUserDto {
  id: number;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  roles: RoleDto[];
  permissions: string[];
  twoFactorEnabled: boolean;
  loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Role DTO
 */
export interface RoleDto {
  id: number;
  name: string;
  code?: string;
  description?: string;
}

/**
 * Token response DTO
 */
export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
}

/**
 * Session info DTO
 */
export interface SessionDto {
  id: string;
  userId: number;
  ip?: string;
  userAgent?: string;
  lastActivity: Date;
  expiresAt: Date;
}

/**
 * Error response DTO
 */
export interface ErrorResponseDto {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: any;
    timestamp: Date;
  };
}
