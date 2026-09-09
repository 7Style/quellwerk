import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import { UserService } from '../services/user.service.js';
import type { IUserEmailSender } from '../interfaces/user-email-sender.interface.js';
import type { PrismaClient } from '../../../lib/prisma.js';

/**
 * The users API must never expose internal columns. The fake client below
 * behaves like Prisma for `select`: it returns only the selected keys. A query
 * without `select` (or with `include`) would return the full row, including
 * the sensitive columns, and fail the assertions.
 */
const SENSITIVE_KEYS = [
  'password',
  'resetToken',
  'resetTokenExpires',
  'emailVerificationToken',
  'emailVerificationExpires',
  'failedAttempts',
  'sessions',
];

type Row = Record<string, unknown>;
type Select = Record<string, unknown>;

function applySelect(row: Row, select: Select): Row {
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === true) {
      out[key] = row[key];
    } else if (spec && typeof spec === 'object' && 'select' in spec) {
      const nested = (spec as { select: Select }).select;
      const value = row[key];
      out[key] = Array.isArray(value)
        ? value.map((item) => applySelect(item as Row, nested))
        : value && typeof value === 'object'
          ? applySelect(value as Row, nested)
          : value;
    }
  }
  return out;
}

async function fullRow(): Promise<Row> {
  return {
    id: 1,
    email: 'admin@example.com',
    password: await bcrypt.hash('Current-Pass-1!', 4),
    firstName: 'Ada',
    lastName: 'Admin',
    phone: null,
    department: null,
    position: null,
    isActive: true,
    emailVerified: true,
    emailVerificationToken: 'verify-token-plain',
    emailVerificationExpires: new Date(),
    preferredLanguage: 'de',
    failedAttempts: 3,
    lockedUntil: null,
    lastLogin: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    resetToken: 'reset-token-plain',
    resetTokenExpires: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    twoFactorEnabled: false,
    twoFactorVerified: false,
    loginSecurityMode: 'NONE',
    sessions: [{ id: 'session-1', token: 'session-token', userAgent: 'jest' }],
    userRoles: [
      {
        userId: 1,
        roleId: 1,
        assignedAt: new Date(),
        assignedBy: 1,
        role: {
          id: 1,
          code: 'SUPER_ADMIN',
          name: 'Super Admin',
          nameGerman: 'Superadmin',
          description: null,
          rolePermissions: [
            { permission: { id: 1, resource: 'users:users', action: 'read', module: 'users', description: null } },
          ],
        },
      },
    ],
  };
}

function createFakePrisma(row: Row) {
  const respond = (args: { select?: Select; include?: unknown } | undefined): Row =>
    args?.select ? applySelect(row, args.select) : { ...row };

  return {
    user: {
      // Lookups by e-mail are the availability checks: no such user yet
      findUnique: jest.fn(async (args: { where?: { email?: string }; select?: Select; include?: unknown }) =>
        args.where?.email ? null : respond(args)
      ),
      findMany: jest.fn(async (args: { select?: Select; include?: unknown }) => [respond(args)]),
      count: jest.fn(async () => 1),
      create: jest.fn(async (args: { select?: Select; include?: unknown }) => respond(args)),
      update: jest.fn(async () => ({})),
    },
    session: { deleteMany: jest.fn(async () => ({ count: 1 })) },
  };
}

describe('UserService response shape', () => {
  let row: Row;
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: UserService;

  beforeEach(async () => {
    row = await fullRow();
    prisma = createFakePrisma(row);
    const emailSender = {
      sendOtpWelcomeEmail: jest.fn<IUserEmailSender['sendOtpWelcomeEmail']>().mockResolvedValue(undefined),
      sendPasswordSetupEmail: jest.fn<IUserEmailSender['sendPasswordSetupEmail']>().mockResolvedValue(undefined),
    } as unknown as IUserEmailSender;
    service = new UserService(prisma as unknown as PrismaClient, emailSender);
  });

  it('findById (GET /api/users/:id and /me) returns no sensitive columns and no sessions', async () => {
    const user = (await service.findById(1)) as unknown as Row;

    for (const key of SENSITIVE_KEYS) {
      expect(user).not.toHaveProperty(key);
    }
    expect(user).toMatchObject({ id: 1, email: 'admin@example.com', firstName: 'Ada' });
    expect((user.userRoles as Row[])[0]).toMatchObject({ role: { code: 'SUPER_ADMIN' } });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.any(Object) })
    );
    expect(prisma.user.findUnique.mock.calls[0][0]).not.toHaveProperty('include');
  });

  it('findAll (GET /api/users) returns no sensitive columns', async () => {
    const result = await service.findAll({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.meta.total).toBe(1);
    const user = result.data[0] as unknown as Row;
    for (const key of SENSITIVE_KEYS) {
      expect(user).not.toHaveProperty(key);
    }
    expect(JSON.stringify(result)).not.toMatch(/reset-token-plain|verify-token-plain|session-token|\$2b\$/);
  });

  it('create (POST /api/users) returns no sensitive columns', async () => {
    const user = (await service.create({
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
    })) as unknown as Row;

    for (const key of SENSITIVE_KEYS) {
      expect(user).not.toHaveProperty(key);
    }
  });

  it('updatePassword reads the hash through an explicit select and never returns it', async () => {
    await service.updatePassword(1, { currentPassword: 'Current-Pass-1!', newPassword: 'New-Pass-2!' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: { password: true } })
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: expect.stringMatching(/^\$2[aby]\$/) }) })
    );
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
  });
});
