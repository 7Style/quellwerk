import { BaseAuthService } from './base.service.js';
import { CryptoUtil } from '../internal/utils/crypto.util.js';

/**
 * User row with roles and permissions as read through the application client.
 * The password hash and the reset / verification tokens are globally omitted
 * columns (app/lib/prisma-omit.ts) and are deliberately not part of this
 * shape: the hash is read by findPasswordHash() only, the tokens are stored
 * and looked up as SHA-256 hashes (the raw token only travels in the e-mail).
 */
export interface UserWithRolesAndPermissions {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  preferredLanguage?: string;
  emailVerified: boolean;
  isActive: boolean;
  lockedUntil: Date | null;
  failedAttempts: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userRoles: Array<{
    role: {
      id: number;
      name: string;
      code?: string;
      rolePermissions: Array<{
        permission: {
          id: number;
          resource: string;
          action: string;
          module?: string;
        };
      }>;
    };
  }>;
  twoFactorEnabled?: boolean;
  loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
}

export interface CreateUserData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/** Fields of the lightweight lookups (findByEmail, token lookups) */
export interface UserLookup {
  id: number;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  loginSecurityMode: 'NONE' | 'TWO_FACTOR' | 'ONE_TIME_PASSWORD';
}

const userLookupSelect = {
  id: true,
  email: true,
  emailVerified: true,
  isActive: true,
  loginSecurityMode: true,
} as const;

/** Tokens are stored hashed; the same digest is used for the lookup */
const hashToken = (token: string): string => CryptoUtil.hash(token);

export class UserDbService extends BaseAuthService {
  constructor() {
    super();
    // prisma ist jetzt über this.prisma verfügbar
  }

  /**
   * Find user by email with all roles and permissions
   */
  async findUserWithRolesAndPermissions(
    email: string
  ): Promise<UserWithRolesAndPermissions | null> {
    if (!email) {
      return null;
    }


    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        twoFactorAuth: {
          select: {
            verifiedAt: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      twoFactorEnabled: !!user.twoFactorAuth?.verifiedAt,
    } as unknown as UserWithRolesAndPermissions;
  }

  /**
   * Find user by ID with all roles and permissions
   */
  async findUserById(userId: number): Promise<UserWithRolesAndPermissions | null> {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        twoFactorAuth: {
          select: {
            verifiedAt: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      twoFactorEnabled: !!user.twoFactorAuth?.verifiedAt,
    } as unknown as UserWithRolesAndPermissions;
  }

  /**
   * Find user by email (lightweight lookup, no relations)
   */
  async findByEmail(email: string): Promise<UserLookup | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: userLookupSelect,
    });
  }

  /**
   * Password hash of a user. The only place that reads the globally omitted
   * `password` column; callers compare with PasswordUtil.compare and never
   * return the value.
   */
  async findPasswordHash(userId: number): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    return user?.password ?? null;
  }

  /**
   * Find user by email with full details
   */
  async findUserByEmail(email: string): Promise<UserWithRolesAndPermissions | null> {

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return {
      ...user,
      twoFactorEnabled: !!user.twoFactorEnabled,
    } as unknown as UserWithRolesAndPermissions;
  }

  /**
   * Create new user
   */
  async createUser(data: CreateUserData): Promise<UserWithRolesAndPermissions> {

    // Create user with default USER role
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        userRoles: {
          create: {
            role: {
              connectOrCreate: {
                where: { code: 'USER' },
                create: {
                  code: 'USER',
                  name: 'USER',
                  nameGerman: 'Benutzer',
                  description: 'Default user role',
                },
              },
            },
          },
        },
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    this.logger.info('User created', { userId: user.id, email: user.email });
    
    // The query includes all required relations, so type assertion is safe
    return user as unknown as UserWithRolesAndPermissions;
  }

  /**
   * Update user's last login timestamp and IP
   */
  async updateLastLogin(userId: number, _ip?: string): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        lastLoginAt: new Date(),
        // lastLoginIp: ip, // Not available in main schema
      },
    });
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(userId: number): Promise<number> {

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedAttempts: {
          increment: 1,
        },
      },
      select: {
        failedAttempts: true,
      },
    });

    return user.failedAttempts;
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(userId: number): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /**
   * Lock user account
   */
  async lockAccount(userId: number, until: Date): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: until,
      },
    });

    this.logger.warn('Account locked', { userId, until });
  }

  /**
   * Save email verification token (stored as SHA-256 hash)
   */
  async saveEmailVerificationToken(
    userId: number, 
    token: string, 
    expiresAt: Date
  ): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: hashToken(token),
        emailVerificationExpires: expiresAt,
      },
    });
  }

  /**
   * Find user by a raw email verification token (hashed lookup, unexpired only)
   */
  async findByEmailVerificationToken(token: string): Promise<UserLookup | null> {

    return this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashToken(token),
        emailVerificationExpires: { gt: new Date() },
      },
      select: userLookupSelect,
    });
  }

  /**
   * Find user by email verification token (alias with roles)
   */
  async findUserByEmailToken(token: string): Promise<UserWithRolesAndPermissions | null> {

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashToken(token),
        emailVerificationExpires: {
          gt: new Date(),
        },
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return {
      ...user,
      twoFactorEnabled: !!user.twoFactorEnabled,
    } as unknown as UserWithRolesAndPermissions;
  }

  /**
   * Mark email as verified
   */
  async markEmailAsVerified(userId: number): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
  }

  /**
   * Save password reset token (stored as SHA-256 hash)
   */
  async savePasswordResetToken(
    userId: number, 
    token: string, 
    expiresAt: Date
  ): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetToken: hashToken(token),
        resetTokenExpires: expiresAt,
      },
    });
  }

  /**
   * Find user by a raw password reset token (hashed lookup, unexpired only)
   */
  async findByPasswordResetToken(token: string): Promise<UserLookup | null> {

    return this.prisma.user.findFirst({
      where: {
        resetToken: hashToken(token),
        resetTokenExpires: { gt: new Date() },
      },
      select: userLookupSelect,
    });
  }

  /**
   * Update user password
   */
  async updatePassword(userId: number, hashedPassword: string): Promise<void> {

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });
  }

  /**
   * Clear password reset token
   */
  async clearPasswordResetToken(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetToken: null,
        resetTokenExpires: null,
      },
    });
  }

  /**
   * Format user response for API
   */
  formatUserResponse(user: UserWithRolesAndPermissions, permissions: string[]) {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      roles: user.userRoles.map(ur => ({
        id: ur.role.id,
        name: ur.role.name,
        code: ur.role.code,
      })),
      permissions,
      twoFactorEnabled: user.twoFactorEnabled || false,
    };
  }

  /**
   * Save reset token (alias, stored as SHA-256 hash)
   */
  async saveResetToken(
    userId: number,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    await this.savePasswordResetToken(userId, token, expiresAt);
  }

  /**
   * Find user by a raw reset token (alias with roles, hashed lookup)
   */
  async findUserByResetToken(token: string): Promise<UserWithRolesAndPermissions | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: hashToken(token),
        resetTokenExpires: {
          gt: new Date(),
        },
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return {
      ...user,
      twoFactorEnabled: !!user.twoFactorEnabled,
    } as unknown as UserWithRolesAndPermissions;
  }
}
