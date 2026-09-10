/**
 * Email Service Configuration
 * Values come from the validated environment (app/config/env.config.ts).
 */

import { env } from '../../config/env.config.js';

// Type definitions for email config
export type EmailProvider = 'smtp' | 'brevo' | 'console';
export type Environment = 'development' | 'production' | 'test';

const environment: Environment = env.NODE_ENV;

// Sender name and subjects carry the application name (APP_NAME), never a
// product name from another project.
const appName = env.APP_NAME;
const fromName = env.EMAIL_FROM_NAME ?? appName;
const fromAddress = env.EMAIL_FROM_ADDRESS ?? env.EMAIL_FROM ?? 'noreply@quellwerk.local';

export const emailConfig = {
  // Environment
  environment,
  isDevelopment: environment === 'development',
  isProduction: environment === 'production',
  isTest: environment === 'test',

  // Provider selection (SMTP must be configured explicitly; there is no default host)
  provider: env.EMAIL_PROVIDER ?? (environment === 'production' ? 'brevo' : 'console'),

  // SMTP Configuration (used by SMTP provider)
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    /** true = implicit TLS (465); false = STARTTLS is enforced via requireTLS */
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASS ?? '',
    },
  },

  // BREVO Configuration (used by BREVO provider)
  brevo: {
    apiKey: env.BREVO_API_KEY ?? '',
    apiUrl: env.BREVO_API_URL,
    defaultSender: {
      name: env.BREVO_SENDER_NAME ?? fromName,
      email: env.BREVO_SENDER_EMAIL ?? fromAddress,
    },
    templates: {
      passwordReset: env.BREVO_TEMPLATE_PASSWORD_RESET,
      emailVerification: env.BREVO_TEMPLATE_EMAIL_VERIFY,
      accountLocked: env.BREVO_TEMPLATE_ACCOUNT_LOCKED,
      twoFactorCode: env.BREVO_TEMPLATE_2FA,
      welcome: env.BREVO_TEMPLATE_WELCOME,
      twoFactorEnabled: env.BREVO_TEMPLATE_2FA_ENABLED,
      twoFactorDisabled: env.BREVO_TEMPLATE_2FA_DISABLED,
    },
  },

  // Email defaults
  defaults: {
    from: {
      name: fromName,
      address: fromAddress,
    },
  },

  // Template settings
  templates: {
    passwordReset: {
      subject: `Passwort zurücksetzen - ${appName}`,
      expiresIn: 60 * 60 * 1000, // 1 hour
    },
    emailVerification: {
      subject: `Email-Adresse bestätigen - ${appName}`,
      expiresIn: 24 * 60 * 60 * 1000, // 24 hours
    },
    accountLocked: {
      subject: `Account gesperrt - ${appName}`,
    },
    twoFactorCode: {
      subject: `Ihr 2FA Code - ${appName}`,
      expiresIn: 5 * 60 * 1000, // 5 minutes
    },
    welcome: {
      subject: `Welcome to ${appName}`, // Will be translated by i18n
    },
    twoFactorEnabled: {
      subject: `Two-Factor Authentication Enabled - ${appName}`, // Will be translated by i18n
    },
    twoFactorDisabled: {
      subject: `Two-Factor Authentication Disabled - ${appName}`, // Will be translated by i18n
    },
    custom: {
      subject: `${appName} Nachricht`,
    },
  },

  // Application URLs
  urls: {
    frontend: env.FRONTEND_URL,
    support: env.SUPPORT_EMAIL ?? 'support@quellwerk.local',
  },

  // Development settings
  development: {
    logToConsole: env.EMAIL_LOG_TO_CONSOLE,
    preview: env.EMAIL_PREVIEW,
  },

  // Rate limiting
  rateLimit: {
    perUserPerHour: env.EMAIL_RATE_LIMIT_PER_USER,
    totalPerHour: env.EMAIL_RATE_LIMIT_TOTAL,
  },
} as const;

// Export type for TypeScript
export type EmailConfig = typeof emailConfig;
