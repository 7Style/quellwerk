/**
 * Module Registration Entry Point
 * ================================
 *
 * This file is the main entry point for registering all backend modules.
 * Modules are registered with dependency injection for better testability.
 * All configuration values come from the validated `env`/`config` objects;
 * there are no secret fallbacks here.
 */

import type { Express } from 'express';
import { EventEmitter } from 'node:events';
import { initUserModule } from './users/index.js';
import { initAuditLogsModule } from './audit-logs/index.js';
import { createAuthModule } from './auth/create-auth-module.js';
import { requireSuperAdmin } from './auth/internal/middleware/role-guard.middleware.js';
import { prisma } from '../lib/prisma.js';
import { AuthEmailAdapter } from '../adapters/auth-email.adapter.js';
import { UserEmailAdapter } from '../adapters/user-email.adapter.js';
import { authMiddleware } from '../common/middleware/auth.middleware.js';
import { createRateLimiter, createRedisRateLimitStore } from '../common/middleware/rate-limit.middleware.js';
import { startupStatus } from '../common/utils/startup-status.util.js';
import { logger } from '../common/utils/logger.util.js';
import { config, env } from '../config/index.js';
import { createUploadModule } from './upload/index.js';

// Global event emitter for cross-module communication
const globalEventEmitter = new EventEmitter();
// Increase max listeners to avoid warnings with many modules
globalEventEmitter.setMaxListeners(50);

/**
 * Register all application modules
 *
 * @param app - Express application instance
 */
export async function registerModules(app: Express): Promise<void> {
  try {
    logger.info('[Modules] Starting module registration...');

    // Create adapters - This is where modules are wired together
    const authEmailAdapter = new AuthEmailAdapter();

    // ==========================================================================
    // AUTH MODULE (Required - Must be first)
    // ==========================================================================
    let authService;
    try {
      const authMod = createAuthModule(
        {
          prismaClient: prisma,
          jwtSecret: config.auth.jwt.secret,
          jwtExpiresIn: config.auth.jwt.expiresIn,
          refreshSecret: config.auth.jwt.refreshSecret,
          refreshExpiresIn: config.auth.jwt.refreshExpiresIn,
          jwtIssuer: config.auth.jwt.issuer,
          jwtAudience: config.auth.jwt.audience,
          bcryptRounds: config.auth.bcrypt.saltRounds,
          maxLoginAttempts: config.auth.lockout.maxAttempts,
          lockoutDuration: config.auth.lockout.lockoutDuration,
          sessionMaxAge: config.auth.session.maxAge,
          twoFactorIssuer: config.app.name,
          twoFactorSecret: config.auth.encryptionKey,
          frontendUrl: config.app.urls.frontend,
          rateLimitWindowMs: config.rateLimit.auth.windowMs,
          rateLimitMax: config.rateLimit.auth.limit,
          rateLimitPasswordResetMax: config.rateLimit.passwordReset.limit,
          rateLimitTwoFactorMax: config.rateLimit.twoFactor.limit,
          rateLimitRegistrationMax: config.rateLimit.registration.limit,
          rateLimitStore: createRedisRateLimitStore,
          emailNotifications: {
            appName: config.app.name,
            from: config.email.defaults.from.address,
            supportEmail: config.email.urls.support,
            subjects: {
              passwordReset: env.EMAIL_SUBJECT_PASSWORD_RESET,
              emailVerification: env.EMAIL_SUBJECT_EMAIL_VERIFICATION,
              accountLocked: env.EMAIL_SUBJECT_ACCOUNT_LOCKED,
              twoFactorCode: env.EMAIL_SUBJECT_2FA_CODE,
              oneTimePasswordCode: env.EMAIL_SUBJECT_OTP_CODE,
              welcome: env.EMAIL_SUBJECT_WELCOME,
              twoFactorEnabled: env.EMAIL_SUBJECT_2FA_ENABLED,
              twoFactorDisabled: env.EMAIL_SUBJECT_2FA_DISABLED,
              custom: env.EMAIL_SUBJECT_CUSTOM,
            },
          },
          logger,
        },
        authEmailAdapter
      );

      app.use('/api/auth', authMod.getRouter());
      authService = authMod.getServices().auth;
      startupStatus.moduleOk('Auth');
    } catch (e) {
      startupStatus.moduleFail('Auth', e);
      throw e;
    }

    // ==========================================================================
    // USER MODULE
    // ==========================================================================
    const userEmailAdapter = new UserEmailAdapter(authService);

    try {
      initUserModule(app, prisma, { emailSender: userEmailAdapter });
      startupStatus.moduleOk('Users');
    } catch (e) {
      startupStatus.moduleFail('Users', e);
    }

    // ==========================================================================
    // AUDIT LOGS MODULE (SUPER_ADMIN only)
    // ==========================================================================
    try {
      initAuditLogsModule(app, {
        prismaClient: prisma,
        logger,
        authenticateMiddleware: authMiddleware,
        roleGuardMiddleware: requireSuperAdmin(),
        rateLimitMiddleware: createRateLimiter('audit-logs-api', config.rateLimit.api),
        basePath: '/api/audit-logs',
      });
      startupStatus.moduleOk('AuditLogs');
    } catch (e) {
      startupStatus.moduleFail('AuditLogs', e);
    }

    // ==========================================================================
    // UPLOAD MODULE (authentication is mandatory)
    // ==========================================================================
    try {
      const uploadModule = createUploadModule({
        uploadDir: config.upload.dir,
        baseUrl: config.app.urls.base,
        requireAuth: authMiddleware,
      });
      app.use('/api/upload', uploadModule.getRouter());
      startupStatus.moduleOk('Upload');
    } catch (e) {
      startupStatus.moduleFail('Upload', e);
    }

    // ==========================================================================
    // ADD YOUR MODULES HERE
    // ==========================================================================
    // Example:
    // try {
    //   const myModule = createMyModule({ prisma, logger, authMiddleware });
    //   app.use('/api/my-module', myModule.getRouter());
    //   startupStatus.moduleOk('MyModule');
    // } catch (e) {
    //   startupStatus.moduleFail('MyModule', e);
    // }

    logger.info('[Modules] All modules registered successfully');
    startupStatus.logSummary();
  } catch (error) {
    logger.error('[Modules] Failed to register modules', error);
    throw error;
  }
}

// Export event emitter for cross-module communication
export { globalEventEmitter };
