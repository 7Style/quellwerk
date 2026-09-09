/**
 * BREVO Provider specific types
 */

export interface BrevoConfig {
  apiKey: string;
  apiUrl: string;
  defaultSender: {
    name: string;
    email: string;
  };
}

export interface BrevoTemplateMapping {
  passwordReset: number;
  emailVerification: number;
  accountLocked: number;
  twoFactorCode: number;
  welcome: number;
  [key: string]: number; // Allow additional templates
}

export interface BrevoSendEmailRequest {
  to: BrevoRecipient[];
  templateId: number;
  params?: Record<string, any>;
  subject?: string;
  sender?: BrevoSender;
  replyTo?: BrevoSender;
  cc?: BrevoRecipient[];
  bcc?: BrevoRecipient[];
}

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface BrevoSender {
  email: string;
  name?: string;
}

export interface BrevoApiResponse {
  messageId: string;
}
