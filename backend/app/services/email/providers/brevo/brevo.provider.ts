/**
 * BREVO Email Provider
 * Uses BREVO API for sending transactional emails
 */

import { EmailProvider, ProviderMailOptions } from '../provider.interface.js';
import { BrevoSendEmailRequest } from './brevo.types.js';
import { BrevoApiClient } from './brevo.client.js';
import { emailConfig } from '../../email.config.js';
import { EmailOptions } from '../../email.types.js';
import { getTemplateId } from './brevo.templates.js';
import { logger } from '../../../../common/utils/logger.util.js';

export class BrevoProvider implements EmailProvider {
  private client: BrevoApiClient;
  private isInitialized = false;

  constructor() {
    this.client = new BrevoApiClient(emailConfig.brevo);
  }

  async initialize(): Promise<void> {
    try {
      if (!emailConfig.brevo.apiKey) {
        logger.warn('BREVO Provider not initialized: Missing API key');
        return;
      }

      // Test connection
      const isConnected = await this.client.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to BREVO API');
      }

      this.isInitialized = true;
      logger.info('BREVO Provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize BREVO Provider', { error });
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
        logger.error('BREVO Provider not available');
        return false;
      }

      // Validate template ID
      if (!options.templateId) {
        logger.error('BREVO Provider requires templateId');
        return false;
      }

      // Prepare request
      const sender = options.from || emailConfig.brevo.defaultSender;
      const request: BrevoSendEmailRequest = {
        to: [{ email: options.to }],
        templateId: options.templateId,
        params: options.params || {},
        subject: options.subject,
        sender: {
          email: sender.email,
          name: sender.name,
        },
      };

      // Add optional fields
      if (options.cc) {
        request.cc = Array.isArray(options.cc) 
          ? options.cc.map(email => ({ email }))
          : [{ email: options.cc }];
      }

      if (options.bcc) {
        request.bcc = Array.isArray(options.bcc)
          ? options.bcc.map(email => ({ email }))
          : [{ email: options.bcc }];
      }

      if (options.replyTo) {
        request.replyTo = { email: options.replyTo };
      }

      // Send email
      const response = await this.client.sendTransacEmail(request);
      logger.info('Email sent via BREVO', { 
        to: options.to, 
        templateId: options.templateId,
        messageId: response.messageId 
      });
      return true;
    } catch (error) {
      logger.error('Failed to send email via BREVO', { error, to: options.to });
      return false;
    }
  }

  isAvailable(): boolean {
    return !!emailConfig.brevo.apiKey;
  }

  getName(): string {
    return 'BREVO';
  }

  async sendCustomEmail(options: EmailOptions): Promise<boolean> {
    try {
      // For BREVO, we prefer template IDs
      let templateId = options.templateId;
      
      // If template name is provided, get the ID
      if (options.template && !templateId) {
        templateId = getTemplateId(options.template);
        if (!templateId) {
          logger.error('Template ID not found for template', { template: options.template });
          // Fallback to sendMail with HTML content
          const { renderTemplate } = await import('../../templates/email-templates.js');
          const rendered = await renderTemplate(options.template, options.data || {}, options.language || 'en');
          return this.sendMail({
            to: options.to,
            subject: options.subject,
            html: rendered.html,
            text: rendered.text,
          });
        }
      }
      
      // If we have a template ID, use it
      if (templateId) {
        return this.sendMail({
          to: options.to,
          subject: options.subject,
          templateId,
          params: options.data || {},
        });
      }
      
      // Otherwise, send with HTML/text content
      return this.sendMail({
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
        attachments: options.attachments,
      });
    } catch (error) {
      logger.error('Failed to send custom email via BREVO', { error, to: options.to });
      return false;
    }
  }
}
