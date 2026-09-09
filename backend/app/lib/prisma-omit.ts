import type { Prisma } from '../generated/prisma/client.js';

/**
 * Columns that never leave the database layer by accident.
 *
 * Applied as the global `omit` of the application PrismaClient (lib/prisma.ts):
 * every query result lacks these fields unless the call site opts in with
 * `omit: { field: false }` or an explicit `select` (password check at login,
 * hashed token lookups, TOTP verification, backup-code check). API responses,
 * audit-log snapshots and log lines therefore cannot carry password hashes,
 * reset or verification tokens, TOTP secrets or backup codes.
 *
 * Kept in its own module without imports of the app config so that modules
 * and tests can reference the list without loading the environment.
 */
export const sensitiveColumns = {
  user: {
    password: true,
    resetToken: true,
    resetTokenExpires: true,
    emailVerificationToken: true,
    emailVerificationExpires: true,
  },
  twoFactorAuth: {
    secret: true,
    tempSecret: true,
  },
  twoFactorBackupCode: {
    code: true,
  },
} satisfies Prisma.GlobalOmitConfig;
