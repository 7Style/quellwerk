import type { Express, Router } from 'express';
import type { Store as RateLimitStore } from 'express-rate-limit';
import type { PrismaClient } from '../../../lib/prisma.js';
import type { LoggerLike } from '../services/base.service.js';
import type { AuthEmailNotificationsOverrides } from '../configs/email-notifications.config.js';

export interface IAuthModuleConfig {
  // Database
  databaseUrl?: string;  // Optional, wenn prismaClient übergeben wird
  prismaClient?: PrismaClient;  // Optionaler externer PrismaClient

  // JWT Configuration (HS256 only; issuer/audience are shared by all token services)
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
  jwtIssuer?: string;
  jwtAudience?: string;

  // Security
  bcryptRounds?: number;
  maxLoginAttempts?: number;
  lockoutDuration?: number;
  sessionMaxAge?: number;

  // 2FA
  twoFactorIssuer?: string;
  /** Key (min 32 chars) used to encrypt TOTP secrets at rest; the host app passes its ENCRYPTION_KEY */
  twoFactorSecret?: string;

  // Email adapter used by the auth module's internal email service
  emailAdapter?: IEmailAdapter;
  /** Subjects, sender and URLs for the module's own email templates */
  emailNotifications?: AuthEmailNotificationsOverrides;

  // External Services
  auditAdapter?: IAuditAdapter;

  // Frontend URLs (for email links)
  frontendUrl?: string;

  // Rate Limiting
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  rateLimitRefreshMax?: number;
  rateLimitPasswordResetMax?: number;
  rateLimitTwoFactorMax?: number;
  /** POST /register per IP and hour (counted per request) */
  rateLimitRegistrationMax?: number;
  /** POST /check-email and /otp/request per IP and 15 minutes (counted per request) */
  rateLimitLookupMax?: number;
  /** Store factory for express-rate-limit (e.g. Redis); in-memory when omitted */
  rateLimitStore?: (name: string) => RateLimitStore;

  // One-Time Password
  oneTimePassword?: {
    codeLength?: number;
    expiresInMinutes?: number;
    resendCooldownSeconds?: number;
    maxVerificationAttempts?: number;
  };

  // REQUIRED: Logger via DI (Modul-Unabhängigkeit!)
  logger: LoggerLike;
}

/**
 * Email adapter interface for sending emails
 */

export type EmailTemplate = 
  | 'welcome' 
  | 'passwordReset' 
  | 'accountLocked' 
  | 'emailVerification' 
  | 'twoFactorCode'
  | 'twoFactorEnabled'
  | 'twoFactorDisabled'
  | 'oneTimePasswordCode';

export type AuthSecurityMode = 'none' | 'two_factor' | 'one_time_password';

export interface EmailOptions {
  to: string;
  subject: string;
  template?: EmailTemplate;
  templateId?: number;
  data?: Record<string, any>;
  html?: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  }

export interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
}


export interface IEmailAdapter {
    sendEmail(options: EmailOptions): Promise<void>;
}

/**
 * Audit adapter interface for logging auth events
 */
export interface IAuditAdapter {
  log(event: {
    action: string;
    userId?: number;
    metadata?: any;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
}

/**
 * Main Auth Module interface
 */
export interface IAuthModule {
  // Mounting
  mount(app: Express, basePath?: string): void;
  getRouter(): Router;
  
  // Event handling
  on(event: string, handler: (...args: any[]) => void): void;
  
  // Service access
  getServices(): {
    auth: IAuthService;
    session: ISessionService;
    twoFactor: ITwoFactorService;
    oneTimePassword: IOneTimePasswordService;
  };
  
  // Lifecycle
  shutdown(): Promise<void>;
  healthCheck(): Promise<{ status: string; details: any }>;
}

/**
 * Auth Service interface
 */
export interface IAuthService {
  login(email: string, password: string): Promise<AuthResult>;
  logout(sessionId: string): Promise<void>;
  register(data: RegisterData): Promise<AuthResult>;
  refreshToken(refreshToken: string): Promise<TokenPair>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerificationEmail(email: string): Promise<void>;
  requestOneTimePassword(email: string): Promise<OneTimePasswordRequestResult>;
  verifyOneTimePassword(input: OneTimePasswordVerifyInput): Promise<AuthResult>;
  verifyOneTimePasswordToken(token: string, metadata?: { ip?: string; userAgent?: string }): Promise<AuthResult>;
}

/**
 * Session Service interface
 */
export interface ISessionService {
  createSession(userId: number, metadata?: any): Promise<string>;
  getSession(sessionId: string): Promise<SessionData | null>;
  updateSession(sessionId: string, data: any): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteUserSessions(userId: number): Promise<void>;
}

/**
 * Two Factor Service interface
 */
export interface ITwoFactorService {
  setupTwoFactor(userId: number): Promise<TwoFactorSetupResult>;
  verifySetup(userId: number, token: string): Promise<TwoFactorVerifySetupResult>;
  verifyLogin(userId: number, token: string): Promise<boolean>;
  disableTwoFactor(userId: number): Promise<void>;
  generateBackupCodes(userId: number): Promise<string[]>;
  getStatus(userId: number): Promise<TwoFactorStatus>;
}

export interface IOneTimePasswordService {
  createChallenge(user: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    loginSecurityMode: AuthSecurityMode;
    preferredLanguage?: string;
  }): Promise<OneTimePasswordChallenge>;
  verifyCode(challengeToken: string, code: string): Promise<{ userId: number }>;
  verifyDeepLink(token: string): Promise<{ userId: number }>;
  markConsumed(challengeToken: string): Promise<void>;
  cleanupExpired(): Promise<void>;
}

// Data Types
export interface AuthResult {
  user: UserData;
  tokens: TokenPair;
  requiresTwoFactor?: boolean;
  requires2FASetup?: boolean; // User has loginSecurityMode TWO_FACTOR but hasn't set up 2FA yet
  requiresPasswordSetup?: boolean; // User needs to set up password after OTP login
}

export interface UserData {
  id: number;
  email: string;
  roles: string[];
  permissions: string[];
  loginSecurityMode: AuthSecurityMode;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SessionData {
  id: string;
  userId: number;
  metadata?: any;
  expiresAt: Date;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/** Result of /2fa/setup: the authenticator data only, no backup codes yet */
export interface TwoFactorSetupResult {
  secret: string;
  qrCode: string;
  manualEntryKey?: string;
}

/** Result of /2fa/verify-setup: backup codes exist only for a confirmed second factor */
export interface TwoFactorVerifySetupResult {
  backupCodes: string[];
}

export interface TwoFactorStatus {
  enabled: boolean;
  type?: string;
  backupCodesRemaining?: number;
}

export interface OneTimePasswordRequestResult {
  challengeToken: string;
  expiresAt: Date;
  delivered: boolean;
  deliveryMethod: 'email';
}

export interface OneTimePasswordChallenge extends OneTimePasswordRequestResult {
  deepLinkToken?: string;
}

export interface OneTimePasswordVerifyInput {
  challengeToken: string;
  code: string;
  rememberDevice?: boolean;
  metadata?: {
    ip?: string;
    userAgent?: string;
  };
  allowFallback?: boolean;
}
