/**
 * Email Service Module
 * 
 * A self-contained, portable email service module
 * that can be used independently in any project
 */

// Main exports
export { emailService, EmailService } from './email.service.js';
export * from './email.types.js';
export { emailConfig, type EmailConfig } from './email.config.js';

// Template exports (if needed for customization)
export { renderTemplate } from './templates/email-templates.js';