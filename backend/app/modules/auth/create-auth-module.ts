import { AuthModule } from './auth.module.js';
import type { IAuthModuleConfig } from './interfaces/module.interface.js';
import type { IAuthEmailSender } from './interfaces/email-sender.interface.js';
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER } from './internal/utils/token.util.js';

/**
 * Factory function to create a new Auth Module instance
 *
 * @example
 * ```typescript
 * const authModule = createAuthModule({
 *   prismaClient: prisma,
 *   jwtSecret: env.JWT_SECRET,
 *   jwtExpiresIn: '15m',
 *   refreshSecret: env.JWT_REFRESH_SECRET,
 *   refreshExpiresIn: '7d',
 *   logger,
 * });
 *
 * // Mount on Express app
 * authModule.mount(app, '/api/auth');
 *
 * // Subscribe to events
 * authModule.on('USER_LOGIN', (data) => {
 *   console.log('User logged in:', data);
 * });
 * ```
 */
export function createAuthModule(config: IAuthModuleConfig, emailSender?: IAuthEmailSender): AuthModule {
  // Validate required config (no fallbacks: secrets must come from the host app)
  if (!config.databaseUrl && !config.prismaClient) {
    throw new Error('Auth Module: Either databaseUrl or prismaClient is required');
  }

  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('Auth Module: jwtSecret is required (min 32 characters)');
  }

  if (!config.refreshSecret || config.refreshSecret.length < 32) {
    throw new Error('Auth Module: refreshSecret is required (min 32 characters)');
  }

  if (!config.logger) {
    throw new Error('Auth Module: logger is required');
  }

  // Apply defaults
  const finalConfig: IAuthModuleConfig = {
    ...config,
    jwtExpiresIn: config.jwtExpiresIn || '15m',
    refreshExpiresIn: config.refreshExpiresIn || '7d',
    bcryptRounds: config.bcryptRounds || 12,
    maxLoginAttempts: config.maxLoginAttempts || 5,
    lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
    twoFactorIssuer: config.twoFactorIssuer || 'AuthModule',
    rateLimitWindowMs: config.rateLimitWindowMs || 15 * 60 * 1000,
    rateLimitMax: config.rateLimitMax || 5,
    rateLimitRefreshMax: config.rateLimitRefreshMax || 30,
    rateLimitPasswordResetMax: config.rateLimitPasswordResetMax || 3,
    rateLimitTwoFactorMax: config.rateLimitTwoFactorMax || 5,
    rateLimitRegistrationMax: config.rateLimitRegistrationMax || 5,
    rateLimitLookupMax: config.rateLimitLookupMax || 20,
    oneTimePassword: {
      codeLength: config.oneTimePassword?.codeLength || 6,
      expiresInMinutes: config.oneTimePassword?.expiresInMinutes || 10,
      resendCooldownSeconds: config.oneTimePassword?.resendCooldownSeconds ?? 60,
      maxVerificationAttempts: config.oneTimePassword?.maxVerificationAttempts || 5,
    },
    jwtIssuer: config.jwtIssuer || DEFAULT_JWT_ISSUER,
    jwtAudience: config.jwtAudience || DEFAULT_JWT_AUDIENCE,
  };

  return new AuthModule(finalConfig, emailSender);
}

/**
 * Express middleware to integrate Auth Module
 *
 * @example
 * ```typescript
 * app.use('/api/auth', authModuleMiddleware({ prismaClient, jwtSecret, ..., logger }));
 * ```
 */
export function authModuleMiddleware(config: IAuthModuleConfig, emailSender?: IAuthEmailSender) {
  const authModule = createAuthModule(config, emailSender);
  return authModule.getRouter();
}
