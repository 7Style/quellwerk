/**
 * Cryptography utilities for encryption/decryption (AES-256-GCM).
 *
 * Ciphertext format (version 2):
 *   "v2:" + base64(salt[64] | iv[16] | tag[16] | ciphertext)
 *   key = PBKDF2-SHA256(ENCRYPTION_KEY, salt, 600 000 iterations, 32 bytes)
 *
 * Legacy ciphertext without prefix (10 000 iterations) is still decryptable
 * so data written before the upgrade keeps working; new data is always v2.
 */

import crypto from 'node:crypto';
import { authConfig } from '../../config/auth.config.js';
import { logger } from './logger.util.js';

const ENCRYPTION_KEY = authConfig.encryptionKey;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const FORMAT_PREFIX = 'v2:';
const ITERATIONS_V2 = 600_000;
const ITERATIONS_LEGACY = 10_000;

/**
 * Derive a key from the encryption key using PBKDF2
 */
function deriveKey(salt: Buffer, iterations: number): Buffer {
  return crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, iterations, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a string (always writes the v2 format)
 */
export function encrypt(text: string): string {
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt, ITERATIONS_V2);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combine salt, iv, tag, and encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);

    return `${FORMAT_PREFIX}${combined.toString('base64')}`;
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Failed to encrypt data', { cause: error });
  }
}

/**
 * Decrypt a string (v2 or legacy format)
 */
export function decrypt(encryptedText: string): string {
  try {
    const isV2 = encryptedText.startsWith(FORMAT_PREFIX);
    const payload = isV2 ? encryptedText.slice(FORMAT_PREFIX.length) : encryptedText;
    const combined = Buffer.from(payload, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(salt, isV2 ? ITERATIONS_V2 : ITERATIONS_LEGACY);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Failed to decrypt data', { cause: error });
  }
}

/**
 * Generate a random string
 */
export function generateRandomString(length: number): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Hash a string using SHA256
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Compare a plain text with a hash (constant time)
 */
export function compareHash(text: string, hashedText: string): boolean {
  const computed = Buffer.from(hash(text), 'utf8');
  const expected = Buffer.from(hashedText, 'utf8');
  if (computed.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(computed, expected);
}
