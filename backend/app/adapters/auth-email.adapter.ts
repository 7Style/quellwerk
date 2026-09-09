/**
 * Adapter that implements the Auth module's email interface
 * This adapter lives OUTSIDE the auth module and bridges the gap
 * between what auth needs and what email service provides
 */

import { IAuthEmailSender } from '../modules/auth/interfaces/email-sender.interface.js';
import { EmailOptions } from '../modules/auth/interfaces/module.interface.js';
import { emailService } from '../services/email/index.js';
import { appConfig } from '../config/app.config.js';

export class AuthEmailAdapter implements IAuthEmailSender {
  async sendEmail(options: EmailOptions): Promise<void> {
    await emailService.sendCustomEmail({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      from: options.from,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      attachments: options.attachments
    });
  }

  async sendEmailVerificationNotification(email: string, token: string): Promise<void> {
    await emailService.sendEmailVerificationEmail(email, token);
  }

  async sendWelcomeNotification(email: string, token: string): Promise<void> {
    await emailService.sendWelcomeEmail(email, token);
  }

  async sendPasswordResetNotification(email: string, token: string): Promise<void> {
    await emailService.sendPasswordResetEmail(email, token);
  }

  async sendAccountLockedNotification(email: string, token: string): Promise<void> {
    const lockedUntil = new Date(token); // token is actually a date string
    await emailService.sendAccountLockedEmail(email, lockedUntil);
  }

  async sendTwoFactorCodeNotification(email: string, code: string): Promise<void> {
    await emailService.sendTwoFactorCodeEmail(email, code);
  }

  async sendTwoFactorEnabledNotification(email: string, _token: string): Promise<void> {
    await emailService.sendTwoFactorEnabledEmail(email);
  }

  async sendTwoFactorDisabledNotification(email: string, _token: string): Promise<void> {
    await emailService.sendTwoFactorDisabledEmail(email);
  }

  async sendOneTimePasswordCode(email: string, code: string, deepLinkUrl?: string): Promise<void> {
    // OTP email using custom email since there's no specific template
    const subject = `Ihr Einmal-Passwort - ${appConfig.name}`;
    const html = `
      <h2>Ihr Einmal-Passwort</h2>
      <p>Ihr Einmal-Passwort lautet: <strong>${code}</strong></p>
      ${deepLinkUrl ? `<p><a href="${deepLinkUrl}">Direkt einloggen</a></p>` : ''}
      <p>Dieser Code ist 10 Minuten gültig.</p>
    `;
    await emailService.sendCustomEmail({ to: email, subject, html });
  }
}
