/**
 * Console Email Provider
 * Logs emails to console instead of sending them
 * Useful for development and testing
 */

import { EmailProvider, ProviderMailOptions } from '../provider.interface.js';
import { EmailOptions } from '../../email.types.js';
import { logger } from '../../../../common/utils/logger.util.js';

export class ConsoleProvider implements EmailProvider {
  async sendMail(options: ProviderMailOptions): Promise<boolean> {
    const divider = '═'.repeat(80);
    
    console.log('\n' + divider);
    console.log('📧 EMAIL (Console Provider)');
    console.log(divider);
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    
    if (options.from) {
      console.log(`From: ${options.from.name} <${options.from.email}>`);
    }
    
    if (options.cc) {
      console.log(`CC: ${Array.isArray(options.cc) ? options.cc.join(', ') : options.cc}`);
    }
    
    if (options.bcc) {
      console.log(`BCC: ${Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc}`);
    }
    
    if (options.templateId) {
      console.log(`Template ID: ${options.templateId}`);
    }
    
    if (options.params) {
      console.log('Template Parameters:');
      console.log(JSON.stringify(options.params, null, 2));
    }
    
    if (options.html) {
      console.log('\n--- HTML Content (Preview) ---');
      console.log(options.html.substring(0, 500) + '...\n');
    }
    
    if (options.text) {
      console.log('\n--- Text Content ---');
      console.log(options.text.substring(0, 300) + '...\n');
    }
    
    console.log(divider + '\n');
    
    logger.info('Email logged to console', { to: options.to, subject: options.subject });
    return true;
  }

  isAvailable(): boolean {
    return true; // Always available
  }

  getName(): string {
    return 'Console';
  }

  async sendCustomEmail(options: EmailOptions): Promise<boolean> {
    try {
      const divider = '═'.repeat(80);
      
      // Prepare content for console
      let content = options.html || options.text || '';
      
      // If template is provided, render it
      if (options.template && !content) {
        const { renderTemplate } = await import('../../templates/email-templates.js');
        const rendered = await renderTemplate(options.template, options.data || {}, options.language || 'en');
        content = rendered.html;
      }
      
      logger.info(`\n${divider}`);
      logger.info('📧 CUSTOM EMAIL (Console Provider)');
      logger.info(`${divider}`);
      logger.info(`To: ${options.to}`);
      logger.info(`Subject: ${options.subject}`);
      if (options.from) logger.info(`From: ${options.from}`);
      if (options.cc) logger.info(`CC: ${Array.isArray(options.cc) ? options.cc.join(', ') : options.cc}`);
      if (options.bcc) logger.info(`BCC: ${Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc}`);
      if (options.replyTo) logger.info(`Reply-To: ${options.replyTo}`);
      if (options.template) logger.info(`Template: ${options.template}`);
      if (options.templateId) logger.info(`Template ID: ${options.templateId}`);
      if (options.data) logger.info(`Template Data: ${JSON.stringify(options.data, null, 2)}`);
      logger.info(`${divider}`);
      
      if (content) {
        logger.info('Content Preview:');
        logger.info(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      }
      
      if (options.attachments && options.attachments.length > 0) {
        logger.info(`${divider}`);
        logger.info(`Attachments: ${options.attachments.map(a => a.filename).join(', ')}`);
      }
      
      logger.info(`${divider}\n`);
      return true;
    } catch (error) {
      logger.error('Failed to log custom email', { error, to: options.to });
      return false;
    }
  }
}
