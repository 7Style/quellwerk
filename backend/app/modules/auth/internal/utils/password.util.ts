import bcrypt from 'bcrypt';
import { generateRandomPassword } from '../../../../common/utils/random-password.util.js';

// Default configuration (overridden via module config, see AuthMainService)
const DEFAULT_CONFIG = {
  bcrypt: {
    saltRounds: 12,
  },
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  },
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PasswordConfig {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  specialChars?: string;
  bcryptRounds?: number;
}

export class PasswordUtil {
  private static config = DEFAULT_CONFIG;

  /**
   * Configure password utility (called by module initialization)
   */
  static configure(config: PasswordConfig): void {
    if (config.bcryptRounds) {
      this.config.bcrypt.saltRounds = config.bcryptRounds;
    }

    Object.assign(this.config.password, {
      minLength: config.minLength ?? this.config.password.minLength,
      maxLength: config.maxLength ?? this.config.password.maxLength,
      requireUppercase: config.requireUppercase ?? this.config.password.requireUppercase,
      requireLowercase: config.requireLowercase ?? this.config.password.requireLowercase,
      requireNumbers: config.requireNumbers ?? this.config.password.requireNumbers,
      requireSpecialChars: config.requireSpecialChars ?? this.config.password.requireSpecialChars,
      specialChars: config.specialChars ?? this.config.password.specialChars,
    });
  }

  /**
   * Hash a password using bcrypt
   */
  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.config.bcrypt.saltRounds);
  }

  /**
   * Compare a plain password with a hashed password
   */
  static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength according to configured rules
   */
  static validateStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];
    const config = this.config.password;

    // Check length
    if (password.length < config.minLength) {
      errors.push(`Password must be at least ${config.minLength} characters long`);
    }

    if (password.length > config.maxLength) {
      errors.push(`Password must not exceed ${config.maxLength} characters`);
    }

    // Check uppercase
    if (config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Check lowercase
    if (config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Check numbers
    if (config.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Check special characters
    if (config.requireSpecialChars) {
      const specialCharsRegex = new RegExp(
        `[${config.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`
      );
      if (!specialCharsRegex.test(password)) {
        errors.push(
          `Password must contain at least one special character (${config.specialChars})`
        );
      }
    }

    // Check for common patterns
    if (this.hasCommonPatterns(password)) {
      errors.push('Password contains common patterns and is too predictable');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check for common password patterns
   */
  private static hasCommonPatterns(password: string): boolean {
    const commonPatterns = [
      /^(password|12345678|qwerty|admin|letmein|welcome|monkey|dragon)/i,
      /^(.)\1{3,}$/, // Repeated characters (e.g., "aaaa")
      /^(abc|123|qwe)/i, // Sequential characters
      /\d{4}[-/]\d{2}[-/]\d{2}/, // Date patterns
    ];

    return commonPatterns.some((pattern) => pattern.test(password));
  }

  /**
   * Generate a random password (shared CSPRNG implementation)
   */
  static generateRandom(length: number = 16): string {
    return generateRandomPassword(length, this.config.password);
  }

  /**
   * Calculate password strength score (0-100)
   */
  static calculateStrength(password: string): number {
    let score = 0;

    // Length score (max 30 points)
    score += Math.min(password.length * 2, 30);

    // Character variety (max 40 points)
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/\d/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;

    // Pattern penalties
    if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
    if (/^[a-zA-Z]+$/.test(password)) score -= 10; // Only letters
    if (/^\d+$/.test(password)) score -= 10; // Only numbers

    // Bonus for length and complexity
    if (
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^a-zA-Z0-9]/.test(password)
    ) {
      score += 30;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get strength label for a password
   */
  static getStrengthLabel(password: string): string {
    const score = this.calculateStrength(password);

    if (score < 20) return 'Very Weak';
    if (score < 40) return 'Weak';
    if (score < 60) return 'Fair';
    if (score < 80) return 'Good';
    return 'Strong';
  }
}
