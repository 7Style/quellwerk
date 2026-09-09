/**
 * Cryptographically secure random password generation.
 *
 * Single implementation shared by the application and the auth module
 * (both PasswordUtil classes delegate here). Uses `crypto.randomInt`, never
 * `Math.random()`, and a Fisher-Yates shuffle with a CSPRNG.
 */
import crypto from 'node:crypto';

export interface RandomPasswordPolicy {
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  specialChars?: string;
}

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const DEFAULT_SPECIALS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

function pick(alphabet: string): string {
  return alphabet[crypto.randomInt(0, alphabet.length)];
}

function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

export function generateRandomPassword(length = 16, policy: RandomPasswordPolicy = {}): string {
  const {
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true,
    specialChars = DEFAULT_SPECIALS,
  } = policy;

  const required: string[] = [];
  let alphabet = '';

  if (requireUppercase) {
    required.push(pick(UPPERCASE));
    alphabet += UPPERCASE;
  }
  if (requireLowercase) {
    required.push(pick(LOWERCASE));
    alphabet += LOWERCASE;
  }
  if (requireNumbers) {
    required.push(pick(NUMBERS));
    alphabet += NUMBERS;
  }
  if (requireSpecialChars && specialChars.length > 0) {
    required.push(pick(specialChars));
    alphabet += specialChars;
  }
  if (alphabet.length === 0) {
    alphabet = UPPERCASE + LOWERCASE + NUMBERS;
  }

  const chars = [...required];
  while (chars.length < Math.max(length, required.length)) {
    chars.push(pick(alphabet));
  }

  return shuffle(chars).join('');
}
