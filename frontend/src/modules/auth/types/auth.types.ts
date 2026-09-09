/**
 * Login request payload
 */
export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Auth response from API
 */
export interface AuthResponse {
  success: boolean;
  data: {
    user: AuthUser;
    tokens: TokenResponse;
    requiresTwoFactor?: boolean;
  };
  message?: string;
}

/**
 * Authenticated user
 */
export interface AuthUser {
  id: number;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  roles: AuthRole[];
  permissions: string[];
  twoFactorEnabled: boolean;
  loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
}

/**
 * Role
 */
export interface AuthRole {
  id: number;
  name: string;
  code?: string;
}

/**
 * Token response
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
}

/**
 * Refresh token payload
 */
export interface RefreshTokenDto {
  refreshToken: string;
}

/**
 * Auth state for Redux
 */
export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
