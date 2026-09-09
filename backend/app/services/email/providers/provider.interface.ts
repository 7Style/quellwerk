/**
 * Email Provider Interface
 * All email providers must implement this interface
 */

import { EmailOptions } from '../email.types.js';

export interface EmailProvider {
  /**
   * Send an email
   * @returns true if successful, false otherwise
   */
  sendMail(options: ProviderMailOptions): Promise<boolean>;
  
  /**
   * Send a custom email with template support
   * Each provider implements its own logic for handling templates
   */
  sendCustomEmail(options: EmailOptions): Promise<boolean>;
  
  /**
   * Check if the provider is properly configured and available
   */
  isAvailable(): boolean;
  
  /**
   * Get the provider name
   */
  getName(): string;
  
  /**
   * Initialize the provider (if needed)
   */
  initialize?(): Promise<void>;
}

export interface ProviderMailOptions {
  // Common fields
  to: string;
  subject: string;
  from?: {
    name: string;
    email: string;
  };
  
  // SMTP specific
  html?: string;
  text?: string;
  
  // API providers specific (BREVO)
  templateId?: number;
  params?: Record<string, any>;
  
  // Optional fields
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
}
