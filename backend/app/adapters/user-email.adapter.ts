/**
 * Adapter that implements the User module's email interface
 * This adapter lives OUTSIDE the user module
 */

import type { IUserEmailSender } from '../modules/users/interfaces/user-email-sender.interface.js';
import { emailService } from '../services/email/index.js';
import type { IAuthService } from '../modules/auth/interfaces/module.interface.js';
import { prisma } from '../lib/prisma.js';
import { appConfig } from '../config/app.config.js';

export class UserEmailAdapter implements IUserEmailSender {
  constructor(private readonly authService: IAuthService) {}

  async sendWelcomeEmail(email: string, userName: string, temporaryPassword?: string): Promise<void> {
    await emailService.sendWelcomeEmail(email, userName, temporaryPassword);
  }

  async sendEmailVerification(userId: number): Promise<void> {
    // Look up user email and delegate to auth module to generate token + send
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) {
      throw new Error('User not found for verification email');
    }
    await this.authService.resendVerificationEmail(user.email);
  }

  async sendOtpWelcomeEmail(email: string, userName: string, loginUrl: string): Promise<void> {
    const subject = `Willkommen bei ${appConfig.name}`;
    const html = `
      <h2>Willkommen bei ${appConfig.name}, ${userName}!</h2>
      <p>Ihr Konto wurde erfolgreich erstellt. Sie können sich jetzt mit Ihrer E-Mail-Adresse anmelden.</p>
      <p>Klicken Sie auf den folgenden Link, um zur Anmeldeseite zu gelangen:</p>
      <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Zur Anmeldung</a></p>
      <p>Oder kopieren Sie diesen Link: ${loginUrl}</p>
      <p>Bei der Anmeldung geben Sie Ihre E-Mail-Adresse ein und Sie erhalten einen Einmalcode per E-Mail.</p>
      <p>Falls Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie bitte.</p>
    `;
    await emailService.sendCustomEmail({ to: email, subject, html });
  }

  async sendPasswordSetupEmail(email: string, userName: string, setupToken: string): Promise<void> {
    const setupUrl = `${appConfig.urls.frontend}/setup-password?token=${setupToken}`;
    const subject = 'Willkommen - Richten Sie Ihr Passwort ein';
    const html = `
      <h2>Willkommen bei ${appConfig.name}, ${userName}!</h2>
      <p>Ihr Konto wurde erfolgreich erstellt. Bitte richten Sie Ihr Passwort ein, um fortzufahren.</p>
      <p>Klicken Sie auf den folgenden Link, um Ihr Passwort einzurichten:</p>
      <p><a href="${setupUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Passwort einrichten</a></p>
      <p>Oder kopieren Sie diesen Link: ${setupUrl}</p>
      <p><strong>Wichtig:</strong> Dieser Link ist nur für 24 Stunden gültig.</p>
      <p>Nach der Einrichtung Ihres Passworts können Sie sich anmelden und werden aufgefordert, die Zwei-Faktor-Authentifizierung (2FA) zu aktivieren.</p>
      <p>Falls Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie bitte.</p>
    `;
    await emailService.sendCustomEmail({ to: email, subject, html });
  }
}
