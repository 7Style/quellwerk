/**
 * Email Sender Interface for Auth Module
 * This interface is owned by the auth module and defines what IT needs
 * Not what the email service can do!
 */

import { EmailOptions } from "./module.interface.js";

export interface IAuthEmailSender {
 
    sendEmail(options: EmailOptions): Promise<void>;
    sendEmailVerificationNotification(email: string, token: string): Promise<void>;
    sendWelcomeNotification(email: string, token: string): Promise<void>;
    sendPasswordResetNotification(email: string, token: string): Promise<void>;
    sendAccountLockedNotification(email: string, token: string): Promise<void>;
    sendTwoFactorCodeNotification(email: string, code: string): Promise<void>;
    sendTwoFactorEnabledNotification(email: string, token: string): Promise<void>;
    sendTwoFactorDisabledNotification(email: string, token: string): Promise<void>;
    sendOneTimePasswordCode(email: string, code: string, deepLinkUrl?: string): Promise<void>;
}
