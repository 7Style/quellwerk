/**
 * SMTP Provider specific types
 */

import { Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  defaults: {
    from: {
      name: string;
      address: string;
    };
  };
}

export interface SmtpProviderOptions {
  config: SmtpConfig;
  isDevelopment: boolean;
  logToConsole: boolean;
}

export type SmtpTransporter = Transporter;
