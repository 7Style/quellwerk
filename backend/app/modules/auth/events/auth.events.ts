/**
 * Auth Module Events
 * 
 * These events are emitted by the Auth Module and can be subscribed to
 * by the parent application for monitoring, logging, or triggering actions.
 */

export const AuthEvents = {
  // Authentication Events
  USER_LOGIN: 'auth:user:login',
  USER_LOGOUT: 'auth:user:logout',
  USER_REGISTERED: 'auth:user:registered',
  LOGIN_FAILED: 'auth:login:failed',
  
  // Token Events
  TOKEN_REFRESHED: 'auth:token:refreshed',
  TOKEN_EXPIRED: 'auth:token:expired',
  TOKEN_INVALID: 'auth:token:invalid',
  
  // Password Events
  PASSWORD_RESET_REQUESTED: 'auth:password:reset:requested',
  PASSWORD_RESET_COMPLETED: 'auth:password:reset:completed',
  PASSWORD_CHANGED: 'auth:password:changed',
  
  // Email Verification Events
  EMAIL_VERIFICATION_SENT: 'auth:email:verification:sent',
  EMAIL_VERIFIED: 'auth:email:verified',
  
  // Two-Factor Authentication Events
  TWO_FACTOR_SETUP_INITIATED: 'auth:2fa:setup:initiated',
  TWO_FACTOR_ENABLED: 'auth:2fa:enabled',
  TWO_FACTOR_DISABLED: 'auth:2fa:disabled',
  TWO_FACTOR_VERIFIED: 'auth:2fa:verified',
  TWO_FACTOR_FAILED: 'auth:2fa:failed',
  BACKUP_CODES_GENERATED: 'auth:2fa:backup:generated',
  BACKUP_CODE_USED: 'auth:2fa:backup:used',
  ONE_TIME_PASSWORD_REQUESTED: 'auth:otp:requested',
  ONE_TIME_PASSWORD_VERIFIED: 'auth:otp:verified',
  ONE_TIME_PASSWORD_FAILED: 'auth:otp:failed',
  
  // Security Events
  ACCOUNT_LOCKED: 'auth:account:locked',
  SUSPICIOUS_ACTIVITY: 'auth:security:suspicious',
  BRUTE_FORCE_DETECTED: 'auth:security:brute_force',
  
  // Session Events
  SESSION_CREATED: 'auth:session:created',
  SESSION_EXPIRED: 'auth:session:expired',
  SESSION_TERMINATED: 'auth:session:terminated',
} as const;

/**
 * Event payload types
 */
export interface AuthEventPayloads {
  [AuthEvents.USER_LOGIN]: {
    userId: number;
    email: string;
    ip?: string;
    userAgent?: string;
    timestamp: Date;
  };
  
  [AuthEvents.USER_LOGOUT]: {
    userId: number;
    sessionId: string;
    timestamp: Date;
  };
  
  [AuthEvents.USER_REGISTERED]: {
    userId: number;
    email: string;
    timestamp: Date;
  };
  
  [AuthEvents.LOGIN_FAILED]: {
    email: string;
    reason: string;
    ip?: string;
    attemptNumber?: number;
    timestamp: Date;
  };
  
  [AuthEvents.PASSWORD_RESET_REQUESTED]: {
    email: string;
    ip?: string;
    timestamp: Date;
  };
  
  [AuthEvents.TWO_FACTOR_ENABLED]: {
    userId: number;
    method: string;
    timestamp: Date;
  };
  
  [AuthEvents.ACCOUNT_LOCKED]: {
    userId?: number;
    email: string;
    reason: string;
    lockedUntil: Date;
    timestamp: Date;
  };
  
  [AuthEvents.SUSPICIOUS_ACTIVITY]: {
    userId?: number;
    activity: string;
    details: any;
    ip?: string;
    timestamp: Date;
  };

  [AuthEvents.ONE_TIME_PASSWORD_REQUESTED]: {
    userId: number;
    email: string;
    timestamp: Date;
  };

  [AuthEvents.ONE_TIME_PASSWORD_VERIFIED]: {
    userId: number;
    email: string;
    timestamp: Date;
  };

  [AuthEvents.ONE_TIME_PASSWORD_FAILED]: {
    email: string;
    reason: string;
    challengeToken?: string;
    timestamp: Date;
  };
}

/**
 * Type-safe event emitter helper
 */
export type AuthEventEmitter = {
  emit<K extends keyof AuthEventPayloads>(
    event: K,
    payload: AuthEventPayloads[K]
  ): void;
  
  on<K extends keyof AuthEventPayloads>(
    event: K,
    listener: (payload: AuthEventPayloads[K]) => void
  ): void;
};
