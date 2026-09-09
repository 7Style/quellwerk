import { BaseException, UnauthorizedException, ForbiddenException } from './base.exception.js';

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid email or password');
  }
}

export class AccountLockedException extends BaseException {
  public readonly lockedUntil?: Date;
  public readonly remainingAttempts?: number;

  constructor(lockedUntil?: Date, remainingAttempts?: number) {
    super('Account is locked due to too many failed login attempts', 423);
    this.lockedUntil = lockedUntil;
    this.remainingAttempts = remainingAttempts;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      code: 'ACCOUNT_LOCKED',
      lockedUntil: this.lockedUntil,
      remainingAttempts: this.remainingAttempts,
    };
  }
}

export class AccountDisabledException extends UnauthorizedException {
  constructor() {
    super('Account has been disabled');
  }
}

export class EmailNotVerifiedException extends UnauthorizedException {
  constructor() {
    super('Email address has not been verified');
  }
}

export class TokenExpiredException extends UnauthorizedException {
  constructor(tokenType: string = 'Token') {
    super(`${tokenType} has expired`);
  }
}

export class InvalidTokenException extends UnauthorizedException {
  constructor(tokenType: string = 'Token') {
    super(`Invalid ${tokenType}`);
  }
}

export class RefreshTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('Refresh token has expired. Please login again');
  }
}

export class SessionExpiredException extends UnauthorizedException {
  constructor() {
    super('Session has expired. Please login again');
  }
}

export class InsufficientPermissionsException extends ForbiddenException {
  public readonly requiredPermissions?: string[];
  public readonly userPermissions?: string[];

  constructor(requiredPermissions?: string[], userPermissions?: string[]) {
    super('Insufficient permissions to perform this action');
    this.requiredPermissions = requiredPermissions;
    this.userPermissions = userPermissions;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      requiredPermissions: this.requiredPermissions,
      userPermissions: this.userPermissions,
    };
  }
}

export class RoleNotFoundException extends ForbiddenException {
  constructor(role: string) {
    super(`Role '${role}' not found or not assigned`);
  }
}

export class PasswordResetTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('Password reset token has expired. Please request a new one');
  }
}

export class InvalidPasswordResetTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid password reset token');
  }
}

export class WeakPasswordException extends UnauthorizedException {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super('Password does not meet security requirements');
    this.errors = errors;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

export class TwoFactorRequiredException extends UnauthorizedException {
  constructor() {
    super('Two-factor authentication is required');
  }
}

export class InvalidTwoFactorCodeException extends UnauthorizedException {
  constructor() {
    super('Invalid two-factor authentication code');
  }
}



