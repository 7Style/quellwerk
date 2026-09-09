import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { AuthSecurityMode, type Prisma, type PrismaClient } from '../../../lib/prisma.js';
import type {
  CreateOtpUserDto,
  CreateUserDto,
  LoginSecurityMode,
  QueryUserDto,
  RegisterUserDto,
  UpdateMeDto,
  UpdatePasswordDto,
  UpdateUserDto,
} from '../dto/index.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/index.js';
import { logger } from '../../../common/utils/logger.util.js';
import { AUTH_CONFIG } from '../../../config/auth.config.js';
import { appConfig } from '../../../config/app.config.js';
import type { IUserEmailSender } from '../interfaces/user-email-sender.interface.js';

/**
 * Columns that may leave the users API. Everything else (password hash,
 * reset / verification tokens, failed-attempt counter, sessions) stays in the
 * database layer; the hash and the tokens are additionally omitted globally
 * (app/lib/prisma-omit.ts). Roles are selected with their permissions so
 * admin views can show them.
 */
const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  department: true,
  position: true,
  isActive: true,
  emailVerified: true,
  preferredLanguage: true,
  lockedUntil: true,
  lastLogin: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  twoFactorEnabled: true,
  twoFactorVerified: true,
  loginSecurityMode: true,
  userRoles: {
    select: {
      roleId: true,
      assignedAt: true,
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          nameGerman: true,
          description: true,
          rolePermissions: {
            select: {
              permission: {
                select: { id: true, resource: true, action: true, module: true, description: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
export { publicUserSelect };

export class UserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailSender: IUserEmailSender
  ) {}

  private normalizeId(id: number | string): number {
    if (typeof id === 'number') {
      return id;
    }

    const parsed = Number(id);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Ungültige Benutzer-ID');
    }
    return parsed;
  }

  private normalizeLoginMode(mode?: LoginSecurityMode): AuthSecurityMode {
    switch (mode) {
      case 'two_factor':
        return AuthSecurityMode.TWO_FACTOR;
      case 'one_time_password':
        return AuthSecurityMode.ONE_TIME_PASSWORD;
      case 'none':
      default:
        return AuthSecurityMode.NONE;
    }
  }

  private get loginUrl(): string {
    return `${appConfig.urls.frontend.replace(/\/$/, '')}/login`;
  }

  private async hashRandomPassword(): Promise<string> {
    // Placeholder password for OTP users: they never use it and set a real one later
    const randomPassword = crypto.randomBytes(32).toString('hex');
    return bcrypt.hash(randomPassword, AUTH_CONFIG.bcrypt.saltRounds);
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Ein Benutzer mit dieser E-Mail-Adresse existiert bereits');
    }
  }

  /**
   * Create a new user (OTP-based onboarding)
   * Users will receive a welcome email with login link, then use OTP to login
   */
  async create(data: CreateUserDto | RegisterUserDto): Promise<PublicUser> {
    await this.assertEmailAvailable(data.email);

    const hashedPassword = await this.hashRandomPassword();
    const { roleIds, loginSecurityMode: _mode, ...userData } = data as CreateUserDto;

    try {
      const user = await this.prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
          // Force ONE_TIME_PASSWORD mode for new users
          loginSecurityMode: AuthSecurityMode.ONE_TIME_PASSWORD,
          isActive: userData.isActive ?? true,
          emailVerified: true, // OTP users are auto-verified
          userRoles: roleIds
            ? {
                create: roleIds.map((roleId) => ({
                  roleId,
                  assignedBy: 1, // TODO: Get from current user context
                })),
              }
            : undefined,
        },
        select: publicUserSelect,
      });

      logger.info('OTP user created', { userId: user.id, email: user.email });

      try {
        await this.emailSender.sendOtpWelcomeEmail(
          user.email,
          `${user.firstName} ${user.lastName}`,
          this.loginUrl
        );
        logger.info('OTP welcome email sent', { userId: user.id });
      } catch (error) {
        logger.error('Failed to send OTP welcome email', error, { userId: user.id });

        // Roll back user creation if email fails
        await this.prisma.user.delete({ where: { id: user.id } });

        throw new BadRequestException(
          'Benutzer konnte nicht erstellt werden: E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.'
        );
      }

      return user;
    } catch (error) {
      logger.error('Error creating user', error, { email: data.email });
      throw error;
    }
  }

  /**
   * Get all users with pagination and filtering
   */
  async findAll(query: QueryUserDto) {
    const { page, limit, sortBy, sortOrder, ...filters } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (filters.search) {
      const searchTrimmed = filters.search.trim();
      const searchTerms = searchTrimmed.split(/\s+/);

      if (searchTerms.length === 1) {
        // Single word: search in email, firstName, or lastName
        where.OR = [
          { email: { contains: searchTrimmed, mode: 'insensitive' } },
          { firstName: { contains: searchTrimmed, mode: 'insensitive' } },
          { lastName: { contains: searchTrimmed, mode: 'insensitive' } },
        ];
      } else if (searchTerms.length === 2) {
        // Two words: treat as firstName + lastName combination
        const [firstTerm, secondTerm] = searchTerms;
        where.OR = [
          { email: { contains: searchTrimmed, mode: 'insensitive' } },
          { firstName: { contains: searchTrimmed, mode: 'insensitive' } },
          { lastName: { contains: searchTrimmed, mode: 'insensitive' } },
          {
            AND: [
              { firstName: { contains: firstTerm, mode: 'insensitive' } },
              { lastName: { contains: secondTerm, mode: 'insensitive' } },
            ],
          },
          {
            AND: [
              { firstName: { contains: secondTerm, mode: 'insensitive' } },
              { lastName: { contains: firstTerm, mode: 'insensitive' } },
            ],
          },
        ];
      } else {
        // More than two words: combine first terms for firstName, last term for lastName
        const lastTerm = searchTerms[searchTerms.length - 1];
        const firstTerms = searchTerms.slice(0, -1).join(' ');

        where.OR = [
          { email: { contains: searchTrimmed, mode: 'insensitive' } },
          { firstName: { contains: searchTrimmed, mode: 'insensitive' } },
          { lastName: { contains: searchTrimmed, mode: 'insensitive' } },
          {
            AND: [
              { firstName: { contains: firstTerms, mode: 'insensitive' } },
              { lastName: { contains: lastTerm, mode: 'insensitive' } },
            ],
          },
        ];
      }
    }

    if (filters.email) {
      where.email = { contains: filters.email, mode: 'insensitive' };
    }

    if (filters.firstName) {
      where.firstName = { contains: filters.firstName, mode: 'insensitive' };
    }

    if (filters.lastName) {
      where.lastName = { contains: filters.lastName, mode: 'insensitive' };
    }

    if (filters.department) {
      where.department = { contains: filters.department, mode: 'insensitive' };
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified;
    }

    if (filters.roleId) {
      where.userRoles = {
        some: {
          roleId: filters.roleId,
        },
      };
    }

    if (filters.roleCode) {
      where.userRoles = {
        some: {
          role: {
            code: filters.roleCode,
          },
        },
      };
    }

    const orderBy: Prisma.UserOrderByWithRelationInput = { [sortBy]: sortOrder };

    // Execute query (public columns only, see publicUserSelect)
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: publicUserSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<
    Array<{
      id: number;
      name: string;
      code: string;
      description: string | null;
    }>
  > {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    logger.debug('[UserService] getAllRoles', { count: roles.length });

    return roles;
  }

  /**
   * Get user by ID (public columns with roles and permissions; sessions are
   * never part of a user response, /api/auth/sessions serves the own ones)
   */
  async findById(id: number | string): Promise<PublicUser> {
    const userId = this.normalizeId(id);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    return user;
  }

  /**
   * Update user
   */
  async update(id: number | string, data: UpdateUserDto | UpdateMeDto): Promise<PublicUser> {
    const userId = this.normalizeId(id);

    // Check if user exists
    const existingUser = await this.findById(userId);

    // If email is being updated (admin route only), check for duplicates
    const nextEmail = 'email' in data ? data.email : undefined;
    if (nextEmail && nextEmail !== existingUser.email) {
      await this.assertEmailAvailable(nextEmail);
    }

    const { roleIds, loginSecurityMode, password, ...userData } = data as UpdateUserDto;

    // Hash password if provided
    const hashedPassword = password
      ? await bcrypt.hash(password, AUTH_CONFIG.bcrypt.saltRounds)
      : undefined;

    const shouldDisableTwoFactor =
      typeof loginSecurityMode === 'string' && loginSecurityMode !== 'two_factor';
    const normalizedMode =
      typeof loginSecurityMode === 'string' ? this.normalizeLoginMode(loginSecurityMode) : undefined;

    try {
      // Update user
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...userData,
          ...(hashedPassword ? { password: hashedPassword, passwordChangedAt: new Date() } : {}),
          ...(normalizedMode !== undefined ? { loginSecurityMode: normalizedMode } : {}),
          ...(shouldDisableTwoFactor
            ? {
                twoFactorEnabled: false,
                twoFactorVerified: false,
              }
            : {}),
        },
      });

      // Update roles if provided
      if (roleIds !== undefined) {
        // Remove existing roles
        await this.prisma.userRole.deleteMany({
          where: { userId },
        });

        // Add new roles
        if (roleIds.length > 0) {
          await this.prisma.userRole.createMany({
            data: roleIds.map((roleId) => ({
              userId,
              roleId,
              assignedBy: 1, // TODO: Get from current user context
            })),
          });
        }
      }

      if (shouldDisableTwoFactor) {
        await this.prisma.twoFactorAuth.deleteMany({ where: { userId } });
        await this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
      }

      logger.info('User updated', { userId });

      // Fetch updated user with relations
      return await this.findById(userId);
    } catch (error) {
      logger.error('Error updating user', error, { userId });
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(id: number | string): Promise<void> {
    const userId = this.normalizeId(id);

    // Check if user exists
    await this.findById(userId);

    try {
      // Delete related records first
      await this.prisma.$transaction([
        this.prisma.session.deleteMany({ where: { userId } }),
        this.prisma.userRole.deleteMany({ where: { userId } }),
        this.prisma.auditLog.deleteMany({ where: { userId } }),
        this.prisma.notification.deleteMany({ where: { userId } }),
        this.prisma.user.delete({ where: { id: userId } }),
      ]);

      logger.info('User deleted', { userId });
    } catch (error) {
      logger.error('Error deleting user', error, { userId });
      throw error;
    }
  }

  /**
   * Bulk deactivate users
   */
  async bulkDeactivate(userIds: number[]): Promise<{ success: boolean; deactivatedCount: number }> {
    try {
      const result = await this.prisma.user.updateMany({
        where: {
          id: { in: userIds },
        },
        data: {
          isActive: false,
        },
      });

      logger.info('Users bulk deactivated', { count: result.count, userIds });

      return {
        success: true,
        deactivatedCount: result.count,
      };
    } catch (error) {
      logger.error('Error bulk deactivating users', error, { userIds });
      throw error;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: number, data: UpdatePasswordDto): Promise<void> {
    // The hash is a globally omitted column; selected here for the check only
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Aktuelles Passwort ist falsch');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(data.newPassword, AUTH_CONFIG.bcrypt.saltRounds);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Invalidate all sessions
    await this.prisma.session.deleteMany({
      where: { userId },
    });

    logger.info('User password updated', { userId });
  }

  /**
   * Assign roles to user
   */
  async assignRoles(userId: number, roleIds: number[]): Promise<void> {
    // Check if user exists
    await this.findById(userId);

    // Check if all roles exist
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
    });

    if (roles.length !== roleIds.length) {
      throw new BadRequestException('Eine oder mehrere Rollen existieren nicht');
    }

    // Remove existing roles
    await this.prisma.userRole.deleteMany({
      where: { userId },
    });

    // Assign new roles
    await this.prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({
        userId,
        roleId,
        assignedBy: 1, // TODO: Get from current user context
      })),
    });

    logger.info('Roles assigned to user', { userId, roleIds });
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: number, roleId: number): Promise<void> {
    const userRole = await this.prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
    });

    if (!userRole) {
      throw new NotFoundException('Benutzer hat diese Rolle nicht');
    }

    await this.prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
    });

    logger.info('Role removed from user', { userId, roleId });
  }

  /**
   * Get user statistics
   */
  async getStatistics() {
    const [total, active, verified, byRole] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.userRole.groupBy({
        by: ['roleId'],
        _count: true,
      }),
    ]);

    const roleStats = await Promise.all(
      byRole.map(async (stat) => {
        const role = await this.prisma.role.findUnique({
          where: { id: stat.roleId },
        });
        return {
          role: role?.name,
          count: stat._count,
        };
      })
    );

    return {
      total,
      active,
      inactive: total - active,
      verified,
      unverified: total - verified,
      byRole: roleStats,
    };
  }

  /**
   * Create OTP user and send welcome email
   */
  async createOtpUser(data: CreateOtpUserDto): Promise<{ success: boolean; message: string }> {
    await this.assertEmailAvailable(data.email);

    const { roleIds, loginSecurityMode: _mode, ...userData } = data;

    try {
      const hashedPassword = await this.hashRandomPassword();

      const user = await this.prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          department: userData.department,
          phone: userData.phone,
          loginSecurityMode: AuthSecurityMode.ONE_TIME_PASSWORD,
          isActive: userData.isActive ?? true,
          emailVerified: true, // OTP users are auto-verified
          userRoles: roleIds
            ? {
                create: roleIds.map((roleId) => ({
                  roleId,
                  assignedBy: 1, // TODO: Get from current user context
                })),
              }
            : undefined,
        },
      });

      logger.info('OTP user created', { userId: user.id, email: user.email });

      try {
        await this.emailSender.sendOtpWelcomeEmail(
          user.email,
          `${user.firstName} ${user.lastName}`,
          this.loginUrl
        );
        logger.info('OTP welcome email sent', { userId: user.id });
      } catch (error) {
        logger.error('Failed to send OTP welcome email', error, { userId: user.id });

        // Roll back user creation if email fails
        await this.prisma.user.delete({ where: { id: user.id } });

        throw new BadRequestException(
          'Benutzer konnte nicht erstellt werden: E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.'
        );
      }

      return {
        success: true,
        message: 'Benutzer erfolgreich erstellt. Eine E-Mail mit Anweisungen wurde gesendet.',
      };
    } catch (error) {
      logger.error('Error creating OTP user', error, { email: data.email });
      throw error;
    }
  }
}
