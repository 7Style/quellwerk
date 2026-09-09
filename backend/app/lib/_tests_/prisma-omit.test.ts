import { describe, expect, it } from '@jest/globals';
import { sensitiveColumns } from '../prisma-omit.js';

describe('sensitiveColumns (global Prisma omit)', () => {
  it('omits password hashes, tokens, TOTP secrets and backup codes', () => {
    expect(Object.keys(sensitiveColumns.user).sort()).toEqual(
      [
        'emailVerificationExpires',
        'emailVerificationToken',
        'password',
        'resetToken',
        'resetTokenExpires',
      ].sort()
    );
    expect(Object.keys(sensitiveColumns.twoFactorAuth).sort()).toEqual(['secret', 'tempSecret']);
    expect(Object.keys(sensitiveColumns.twoFactorBackupCode)).toEqual(['code']);
    for (const model of Object.values(sensitiveColumns)) {
      expect(Object.values(model).every((flag) => flag === true)).toBe(true);
    }
  });
});
