/**
 * Auth Module Integration
 * Convenience wrapper for mounting the module on an Express app.
 * Secrets are mandatory options: there are no development fallbacks.
 */

import type { Express } from 'express';
import type { PrismaClient } from '../../lib/prisma.js';
import { createAuthModule } from './create-auth-module.js';
import type { IAuthModuleConfig, IAuthService, IEmailAdapter } from './interfaces/module.interface.js';
import type { LoggerLike } from './services/base.service.js';
import { EmailService as ModuleEmailService } from './services/email-notifications/email-service.js';

export interface AuthModuleOptions
  extends Omit<IAuthModuleConfig, 'prismaClient' | 'databaseUrl' | 'logger' | 'emailAdapter'> {
  emailSender?: IEmailAdapter;
  logger: LoggerLike;
}

/**
 * Initialize auth module with Express app
 */
export function authModule(app: Express, prisma: PrismaClient, options: AuthModuleOptions): IAuthService {
  try {
    const { emailSender, ...config } = options;

    // Build module-internal email service using provided adapter
    const moduleEmailService = emailSender ? new ModuleEmailService(emailSender) : undefined;

    // Create auth module and inject module email service
    const authMod = createAuthModule(
      {
        ...config,
        prismaClient: prisma,
        jwtExpiresIn: config.jwtExpiresIn || '15m',
        refreshExpiresIn: config.refreshExpiresIn || '7d',
      },
      moduleEmailService
    );

    // Mount auth routes
    app.use('/api/auth', authMod.getRouter());

    // Return the auth service for other modules to use
    return authMod.getServices().auth;
  } catch (error) {
    options.logger.error('[Auth] Failed to initialize module', { error });
    throw error;
  }
}
