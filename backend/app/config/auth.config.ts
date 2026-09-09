import { env } from './env.config.js';
import { appConfig } from './app.config.js';

export const authConfig = {
  jwt: {
    secret: env.JWT_SECRET,
    /** Access tokens are short-lived (default 15 minutes) */
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    /** Refresh tokens live 7 days by default */
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    algorithm: 'HS256' as const,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },

  session: {
    secret: env.SESSION_SECRET,
    maxAge: env.SESSION_MAX_AGE,
    maxConcurrentSessions: 5,
    cookieName: 'bp-session',
    secure: appConfig.app.isProduction,
    httpOnly: true,
    sameSite: 'strict' as const,
  },

  /** Single source of truth for bcrypt cost (also used by seeds and backup codes) */
  bcrypt: {
    saltRounds: env.BCRYPT_SALT_ROUNDS,
  },

  /** Key material for symmetric encryption (2FA secrets etc.) */
  encryptionKey: env.ENCRYPTION_KEY,

  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*(),.?":{}|<>',
  },

  lockout: {
    maxAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
    resetAttemptsAfter: 60 * 60 * 1000, // 1 hour
  },

  tokenTypes: {
    access: 'access',
    refresh: 'refresh',
    passwordReset: 'password-reset',
    emailVerification: 'email-verification',
  },

  requireEmailVerification: false, // Set to true in production
};

// Export mit altem Namen für Kompatibilität
export const AUTH_CONFIG = authConfig;
