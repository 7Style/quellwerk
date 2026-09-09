/**
 * Email Provider Factory
 * Creates the appropriate email provider based on configuration
 */

import { EmailProvider } from './provider.interface.js';
import { SmtpProvider } from './smtp/index.js';
import { BrevoProvider } from './brevo/index.js';
import { ConsoleProvider } from './console/index.js';
import { logger } from '../../../common/utils/logger.util.js';
import { emailConfig } from '../email.config.js';

export function createEmailProvider(): EmailProvider {
  const provider = emailConfig.provider;
  
  logger.info(`Creating email provider: ${provider}`);
  
  switch (provider) {
    case 'brevo':
      return new BrevoProvider();
      
    case 'smtp':
      return new SmtpProvider();
      
    case 'console':
      return new ConsoleProvider();
      
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}
