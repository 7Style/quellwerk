/**
 * Email Service Types
 */

import { SupportedLanguage } from '../i18n/i18n.types.js';

export type EmailTemplate = 
  | 'welcome' 
  | 'passwordReset' 
  | 'accountLocked' 
  | 'emailVerification' 
  | 'twoFactorCode'
  | 'twoFactorEnabled'
  | 'twoFactorDisabled';

export interface EmailOptions {
  to: string;
  subject: string;
  template?: EmailTemplate;
  templateId?: number;
  data?: Record<string, any>;
  html?: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  language?: SupportedLanguage;
}

export interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
  subject?: string;
}

export interface EmailConfig {
  provider: 'smtp' | 'brevo' | 'console';
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  brevo: {
    apiKey: string;
  };
  defaults: {
    from: {
      name: string;
      email: string;
    };
  };
  urls: {
    frontend: string;
    api: string;
    support: string;
  };
  development: {
    logToConsole: boolean;
  };
}