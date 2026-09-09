/**
 * SMTP Email Provider
 * Uses Nodemailer for sending emails via SMTP
 */

import nodemailer from 'nodemailer';
import { EmailProvider, ProviderMailOptions } from '../provider.interface.js';
import { SmtpTransporter } from './smtp.types.js';
import { emailConfig } from '../../email.config.js';
import { EmailOptions } from '../../email.types.js';
import { logger } from '../../../../common/utils/logger.util.js';

export class SmtpProvider implements EmailProvider {
  private transporter: SmtpTransporter | null = null;
  private isInitialized = false;

  constructor() {}

  async initialize(): Promise<void> {
    try {
      // Skip SMTP initialization if logging to console
      if (emailConfig.development.logToConsole && emailConfig.isDevelopment) {
        this.isInitialized = true;
        logger.info('SMTP Provider initialized in console logging mode');
        return;
      }

      // No implicit default host: SMTP must be configured explicitly
      if (!emailConfig.smtp.host) {
        throw new Error('SMTP_HOST is not configured');
      }

      // Skip if no credentials
      if (!emailConfig.smtp.auth.user || !emailConfig.smtp.auth.pass) {
        logger.warn('SMTP Provider not initialized: Missing credentials');
        return;
      }

      // Create transporter: implicit TLS on 465 (secure), otherwise STARTTLS is
      // mandatory (requireTLS) and TLS < 1.2 is rejected
      this.transporter = nodemailer.createTransport({
        host: emailConfig.smtp.host,
        port: emailConfig.smtp.port,
        secure: emailConfig.smtp.secure,
        requireTLS: !emailConfig.smtp.secure,
        tls: { minVersion: 'TLSv1.2' },
        auth: {
          user: emailConfig.smtp.auth.user,
          pass: emailConfig.smtp.auth.pass,
        },
      });

      // Verify connection
      await this.transporter.verify();
      this.isInitialized = true;
      logger.info('SMTP Provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SMTP Provider', { error });
      this.isInitialized = false;
      throw error;
    }
  }

  async sendMail(options: ProviderMailOptions): Promise<boolean> {
    try {
      // Initialize if not done yet
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.isInitialized) {
        logger.error('SMTP Provider not available');
        return false;
      }

      // Prepare mail options
      const from = options.from || {
        name: emailConfig.defaults.from.name,
        email: emailConfig.defaults.from.address
      };
      const mailOptions = {
        from: `${from.name} <${from.email}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
        attachments: options.attachments,
      };

      // Console logging mode
      if (emailConfig.isDevelopment && emailConfig.development.logToConsole) {
        logger.info('EMAIL (SMTP Console Mode)', {
          divider: '=================================',
          provider: 'SMTP',
          to: options.to,
          subject: options.subject,
          from: mailOptions.from,
          preview: options.html?.substring(0, 200) + '...',
        });
        return true;
      }

      // Send via SMTP
      await this.transporter?.sendMail(mailOptions);
      logger.info('Email sent via SMTP', { to: options.to, subject: options.subject });
      return true;
    } catch (error) {
      logger.error('Failed to send email via SMTP', { error, to: options.to });
      return false;
    }
  }

  isAvailable(): boolean {
    // In console mode, always available
    if (emailConfig.development.logToConsole && emailConfig.isDevelopment) {
      return true;
    }
    // Check if host and credentials are configured
    return !!(emailConfig.smtp.host && emailConfig.smtp.auth.user && emailConfig.smtp.auth.pass);
  }

  getName(): string {
    return 'SMTP';
  }

  async sendCustomEmail(options: EmailOptions): Promise<boolean> {
    try {
      // Import renderTemplate at the top
        const { renderTemplate } = await import('../../templates/email-templates.js');
      
      // For SMTP, we always need HTML/Text content
      let html = options.html;
      let text = options.text;
      
      // If template is provided, render it
      if (options.template && !html) {
        const rendered = await renderTemplate(options.template, options.data || {}, options.language || 'en');
        html = rendered.html;
        text = rendered.text;
      }
      
      // Parse from field if provided
      let fromField: { name: string; email: string } | undefined;
      if (options.from) {
        const fromStr = options.from;
        if (fromStr.includes('<') && fromStr.includes('>')) {
          const startIdx = fromStr.indexOf('<');
          const endIdx = fromStr.indexOf('>');
          fromField = {
            name: fromStr.substring(0, startIdx).trim() || emailConfig.defaults.from.name,
            email: fromStr.substring(startIdx + 1, endIdx)
          };
        } else {
          fromField = {
            name: emailConfig.defaults.from.name,
            email: fromStr
          };
        }
      }
      
      // Use sendMail with the prepared content
      return this.sendMail({
        to: options.to,
        subject: options.subject,
        html,
        text,
        from: fromField,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
        attachments: options.attachments,
      });
    } catch (error) {
      logger.error('Failed to send custom email via SMTP', { error, to: options.to });
      return false;
    }
  }
}
