// Auth Module - Email Notifications Config
// Single source of truth for subjects, expiries, URLs and default from address.
// Values are injected by the host application through the module config
// (`emailNotifications`, `frontendUrl`); this file reads no environment variables.

export type TemplateKey =
  | 'welcome'
  | 'passwordReset'
  | 'accountLocked'
  | 'emailVerification'
  | 'twoFactorCode'
  | 'twoFactorEnabled'
  | 'twoFactorDisabled'
  | 'oneTimePasswordCode'
  | 'custom';

export interface TemplateConfig {
  subject: string;
  expiresIn?: number; // milliseconds
}

export interface AuthEmailNotificationsConfig {
  /** Application name used in subjects and in the HTML base template */
  appName: string;
  from: string;
  urls: {
    frontend: string;
    support: string;
  };
  templates: Record<TemplateKey, TemplateConfig>;
}

/** Overrides the host application may pass through IAuthModuleConfig */
export interface AuthEmailNotificationsOverrides {
  appName?: string;
  from?: string;
  frontendUrl?: string;
  supportEmail?: string;
  subjects?: Partial<Record<TemplateKey, string | undefined>>;
}

const DEFAULT_APP_NAME = 'bp-monolith';

/** Default subjects and expiries for a given application name */
function defaultTemplates(appName: string): Record<TemplateKey, TemplateConfig> {
  return {
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
    oneTimePasswordCode: {
      subject: `Ihr Einmal-Passwort - ${appName}`,
      expiresIn: 10 * 60 * 1000, // 10 minutes
    },
    welcome: {
      subject: `Welcome to ${appName}`,
    },
    twoFactorEnabled: {
      subject: `Two-Factor Authentication Enabled - ${appName}`,
    },
    twoFactorDisabled: {
      subject: `Two-Factor Authentication Disabled - ${appName}`,
    },
    custom: {
      subject: `${appName} Nachricht`,
    },
  };
}

export const authEmailNotificationsConfig: AuthEmailNotificationsConfig = {
  appName: DEFAULT_APP_NAME,
  from: 'no-reply@bp-monolith.local',
  urls: {
    frontend: 'http://localhost:3010',
    support: 'support@bp-monolith.local',
  },
  templates: defaultTemplates(DEFAULT_APP_NAME),
};

/**
 * Apply host application overrides (called once by AuthModule)
 */
export function configureAuthEmailNotifications(overrides?: AuthEmailNotificationsOverrides): void {
  if (!overrides) return;

  if (overrides.appName) {
    authEmailNotificationsConfig.appName = overrides.appName;
    // Rebuild the defaults with the real name; explicit subjects win below
    authEmailNotificationsConfig.templates = defaultTemplates(overrides.appName);
  }
  if (overrides.from) authEmailNotificationsConfig.from = overrides.from;
  if (overrides.frontendUrl) authEmailNotificationsConfig.urls.frontend = overrides.frontendUrl;
  if (overrides.supportEmail) authEmailNotificationsConfig.urls.support = overrides.supportEmail;

  for (const [key, subject] of Object.entries(overrides.subjects ?? {})) {
    if (subject) {
      authEmailNotificationsConfig.templates[key as TemplateKey].subject = subject;
    }
  }
}
