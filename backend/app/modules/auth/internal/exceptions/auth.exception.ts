/**
 * Auth Module Exceptions
 * Lokale Exception-Klassen für das Auth-Modul
 * Folgt dem Clean Code DI Pattern - keine externen Dependencies
 */

import { BaseException } from "./base.exception.js";

/**
 * Base Auth Exception
 */
export class AuthException extends BaseException {
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "AUTH_ERROR",
    details?: any
  ) {
    super(message, statusCode, code, details);
  }
}

/**
 * Invalid credentials exception
 */
export class InvalidCredentialsException extends AuthException {
  constructor() {
    super("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
}

/**
 * Account locked exception
 */
export class AccountLockedException extends AuthException {
  public readonly lockedUntil?: Date;
  public readonly remainingAttempts?: number;

  constructor(lockedUntil?: Date, remainingAttempts?: number) {
    super("Account is locked due to too many failed login attempts", 423, "ACCOUNT_LOCKED");
    this.lockedUntil = lockedUntil;
    this.remainingAttempts = remainingAttempts;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      lockedUntil: this.lockedUntil,
      remainingAttempts: this.remainingAttempts,
    };
  }
}

/**
 * Account disabled exception
 */
export class AccountDisabledException extends AuthException {
  constructor() {
    super("Account has been disabled", 403, "ACCOUNT_DISABLED");
  }
}

/**
 * Email not verified exception
 */
export class EmailNotVerifiedException extends AuthException {
  constructor() {
    super("Email address has not been verified", 403, "EMAIL_NOT_VERIFIED");
  }
}

/**
 * Invalid token exception
 */
export class InvalidTokenException extends AuthException {
  constructor(message: string = "Invalid or expired token") {
    super(message, 401, "INVALID_TOKEN");
  }
}

/**
 * Token expired exception
 */
export class TokenExpiredException extends AuthException {
  constructor() {
    super("Token has expired", 401, "TOKEN_EXPIRED");
  }
}

/**
 * OTP required exception
 */
export class OtpRequiredException extends AuthException {
  constructor(message: string = "This account requires one-time password authentication") {
    super(message, 403, "OTP_REQUIRED");
  }
}
