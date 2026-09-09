/**
 * Crypto Utilities
 * Local crypto utilities for the Auth module
 * No external dependencies - follows Clean Code DI Pattern
 */

import crypto from 'node:crypto';
import { PasswordUtil } from './password.util.js';

export interface CryptoConfig {
  /** Key material for AES-256-GCM (the host app passes its ENCRYPTION_KEY) */
  encryptionKey?: string;
}

let cryptoConfig: CryptoConfig = {};

const KEY_LENGTH = 32;
const HKDF_INFO = 'bp-monolith:auth:aes-256-gcm';
const SALT_INFO = 'bp-monolith:auth:salt';

/**
 * Derive the AES key from a secret with HKDF-SHA256. The salt itself is
 * derived from the secret (no literal salt in the code base).
 */
function deriveKey(secret: string): Buffer {
  const salt = crypto.createHash('sha256').update(`${SALT_INFO}:${secret}`).digest();
  return Buffer.from(crypto.hkdfSync('sha256', secret, salt, HKDF_INFO, KEY_LENGTH));
}

function requireEncryptionKey(): string {
  const key = cryptoConfig.encryptionKey;
  if (!key || key.length < 32) {
    throw new Error(
      '[Auth] CryptoUtil is not configured: twoFactorSecret/encryptionKey (min 32 chars) is missing'
    );
  }
  return key;
}

export class CryptoUtil {
  /**
   * Configure the module-wide encryption key (called by AuthModule)
   */
  static configure(config: CryptoConfig): void {
    cryptoConfig = { ...cryptoConfig, ...config };
  }

  /**
   * Generate a secure random token
   */
  static generateRandomToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random string with custom charset (unbiased)
   */
  static generateRandomString(length: number, charset?: string): string {
    const chars = charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const result = new Array<string>(length);

    for (let i = 0; i < length; i++) {
      result[i] = chars[crypto.randomInt(0, chars.length)];
    }

    return result.join('');
  }

  /**
   * Generate numeric code (for OTP, etc.)
   */
  static generateNumericCode(length: number = 6): string {
    const max = Math.pow(10, length) - 1;
    const min = Math.pow(10, length - 1);
    const code = crypto.randomInt(min, max + 1);
    return code.toString();
  }

  /**
   * Hash a password using bcrypt (cost from the module configuration)
   */
  static async hashPassword(password: string): Promise<string> {
    return PasswordUtil.hash(password);
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return PasswordUtil.compare(password, hash);
  }

  /**
   * Generate SHA256 hash
   */
  static sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash a string (alias for sha256)
   */
  static hash(data: string): string {
    return this.sha256(data);
  }

  /**
   * Compare hash with plain text (constant time)
   */
  static compareHash(plainText: string, hash: string): boolean {
    const computedHash = this.hash(plainText);
    return this.secureCompare(computedHash, hash);
  }

  /**
   * Generate HMAC
   */
  static hmac(data: string, secret: string, algorithm: string = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Generate UUID v4
   */
  static generateUuid(): string {
    return crypto.randomUUID();
  }

  /**
   * Constant-time string comparison (prevent timing attacks)
   */
  static secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Encrypt data using AES-256-GCM (key derived with HKDF from `secret`)
   */
  static encrypt(text: string, secret: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const key = deriveKey(secret);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  static decrypt(
    encryptedData: { encrypted: string; iv: string; tag: string },
    secret: string
  ): string {
    const key = deriveKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encryptedData.iv, 'hex'));

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate secure backup codes
   */
  static generateBackupCodes(count: number = 10, length: number = 8): string[] {
    const codes: string[] = [];
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters

    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < length; j++) {
        if (j > 0 && j % 4 === 0) {
          code += '-'; // Add dash every 4 characters
        }
        code += this.generateRandomString(1, charset);
      }
      codes.push(code);
    }

    return codes;
  }

  /**
   * Base64 encode
   */
  static base64Encode(data: string): string {
    return Buffer.from(data).toString('base64');
  }

  /**
   * Base64 decode
   */
  static base64Decode(data: string): string {
    return Buffer.from(data, 'base64').toString('utf8');
  }

  /**
   * URL-safe base64 encode
   */
  static base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64url');
  }

  /**
   * URL-safe base64 decode
   */
  static base64UrlDecode(data: string): string {
    return Buffer.from(data, 'base64url').toString('utf8');
  }
}

/**
 * Format version of stored 2FA secrets. A future key or KDF change gets a
 * new prefix and decrypt() dispatches on it; payloads written before the
 * prefix existed (three parts) stay readable.
 */
const CIPHERTEXT_VERSION = 'v1';

/**
 * Encrypt a 2FA secret for storage ("v1:<ciphertext>:<iv>:<tag>", hex)
 */
export function encrypt(text: string): string {
  const result = CryptoUtil.encrypt(text, requireEncryptionKey());
  return `${CIPHERTEXT_VERSION}:${result.encrypted}:${result.iv}:${result.tag}`;
}

/**
 * Decrypt a stored 2FA secret (versioned or legacy unversioned payload)
 */
export function decrypt(encryptedString: string): string {
  const parts = encryptedString.split(':');
  const [encrypted, iv, tag] =
    parts.length === 4 && parts[0] === CIPHERTEXT_VERSION ? parts.slice(1) : parts;
  if (parts.length > 4 || !encrypted || !iv || !tag) {
    throw new Error('[Auth] Invalid encrypted payload');
  }
  return CryptoUtil.decrypt({ encrypted, iv, tag }, requireEncryptionKey());
}
