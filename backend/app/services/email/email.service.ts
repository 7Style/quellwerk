import { logger } from '../../common/utils/logger.util.js';
import { EmailTemplate, EmailOptions } from './email.types.js';
// import { renderTemplate } from './templates/email-templates.js'; // Unused for now
import { emailConfig, EmailConfig } from './email.config.js';
import { appConfig } from '../../config/app.config.js';
import { EmailProvider } from './providers/provider.interface.js';
import { createEmailProvider } from './providers/provider.factory.js';
import { SupportedLanguage } from '../i18n/i18n.types.js';

export class EmailService {
  private provider: EmailProvider;
  private config: EmailConfig;

  constructor() {
    this.config = emailConfig;
    
    try {
      this.provider = createEmailProvider();
      
      // Initialize provider if it has an initialize method
      if (this.provider.initialize) {
        this.provider.initialize().catch(error => {
          logger.error('Failed to initialize email provider', { 
            provider: this.provider.getName(), 
            error 
          });
        });
      }
      
      logger.info(`Email service using ${this.provider.getName()} provider`);
    } catch (error) {
      logger.error('Failed to create email provider', { error });
      throw error;
    }
  }

  /**
   * Send email using template
   */
  async sendEmail(
    to: string,
    template: EmailTemplate,
    data: Record<string, any>,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    try {
      if (!this.provider.isAvailable()) {
        logger.error(`Email provider ${this.provider.getName()} is not available`);
        return false;
      }

      // Get template config
      const templateConfig = this.config.templates[template];
      const subject = templateConfig?.subject || `Email from ${appConfig.name}`;

      // Delegate to provider via sendCustomEmail
      return this.provider.sendCustomEmail({
        to,
        subject,
        template,
        data,
        language,
      });
    } catch (error) {
      logger.error('Failed to send email', { error, to, template });
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    userName?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const resetUrl = `${this.config.urls.frontend}/reset-password?token=${resetToken}`;
    const expiresIn = language === 'de' ? '1 Stunde' : '1 hour';
    
    return this.sendEmail(email, 'passwordReset', {
      userName: userName || email,
      resetUrl,
      expiresIn,
      supportEmail: this.config.urls.support,
    }, language);
  }

  /**
   * Send account locked email
   */
  async sendAccountLockedEmail(
    email: string,
    lockedUntil: Date,
    userName?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const locale = language === 'de' ? 'de-DE' : 'en-US';
    return this.sendEmail(email, 'accountLocked', {
      userName: userName || email,
      lockedUntil: lockedUntil.toLocaleString(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      supportEmail: this.config.urls.support,
    }, language);
  }

  /**
   * Send two-factor authentication code
   */
  async sendTwoFactorCodeEmail(
    email: string,
    code: string,
    userName?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const expiresIn = language === 'de' ? '5 Minuten' : '5 minutes';
    return this.sendEmail(email, 'twoFactorCode', {
      userName: userName || email,
      code,
      expiresIn,
    }, language);
  }

  /**
   * Send two-factor authentication enabled notification
   */
  async sendTwoFactorEnabledEmail(
    email: string,
    userName?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const supportUrl = `${this.config.urls.frontend}/support`;
    return this.sendEmail(email, 'twoFactorEnabled', {
      userName: userName || email,
      supportUrl,
      supportEmail: this.config.urls.support,
    }, language);
  }

  /**
   * Send two-factor authentication disabled notification
   */
  async sendTwoFactorDisabledEmail(
    email: string,
    userName?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const supportUrl = `${this.config.urls.frontend}/support`;
    return this.sendEmail(email, 'twoFactorDisabled', {
      userName: userName || email,
      supportUrl,
      supportEmail: this.config.urls.support,
    }, language);
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    email: string,
    userName: string,
    temporaryPassword?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const loginUrl = `${this.config.urls.frontend}/login`;
    
    return this.sendEmail(email, 'welcome', {
      userName,
      loginUrl,
      temporaryPassword,
      hasTemporaryPassword: !!temporaryPassword,
    }, language);
  }

  /**
   * Send custom email
   * Delegates to the provider's sendCustomEmail implementation
   */
  async sendCustomEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (!this.provider.isAvailable()) {
        logger.warn('Email provider not available', { 
          provider: this.provider.getName(),
          to: options.to 
        });
        return false;
      }

      // Delegate to provider-specific implementation
      return this.provider.sendCustomEmail(options);
    } catch (error) {
      logger.error('Failed to send custom email', { error, to: options.to });
      return false;
    }
  }

  /**
   * Check if email service is available
   */
  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider.getName();
  }

  /**
   * Send email verification email
   */
  async sendEmailVerificationEmail(
    email: string,
    verificationToken: string,
    userName?: string,
    language: SupportedLanguage = 'en'
  ): Promise<boolean> {
    const verificationUrl = `${this.config.urls.frontend}/verify-email?token=${verificationToken}`;
    const expiresIn = language === 'de' ? '24 Stunden' : '24 hours';
    
    return this.sendEmail(email, 'emailVerification', {
      userName: userName || email,
      verificationUrl,
      expiresIn,
      supportEmail: this.config.urls.support,
    }, language);
  }
}

// Export singleton instance - lazy initialization
export const emailService = new EmailService();