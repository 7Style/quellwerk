/**
 * Email Sender Interface for User Module
 * This interface is owned by the user module and defines what IT needs
 */

export interface IUserEmailSender {
  /**
   * Send welcome email to new user
   */
  sendWelcomeEmail(
    email: string,
    userName: string,
    temporaryPassword?: string
  ): Promise<void>;

  /**
   * Send email verification for new user
   */
  sendEmailVerification(
    userId: number
  ): Promise<void>;

  /**
   * Send welcome email to OTP user with login instructions
   */
  sendOtpWelcomeEmail(
    email: string,
    userName: string,
    loginUrl: string
  ): Promise<void>;

  /**
   * Send password setup email to new user with setup token
   */
  sendPasswordSetupEmail(
    email: string,
    userName: string,
    setupToken: string
  ): Promise<void>;
}



