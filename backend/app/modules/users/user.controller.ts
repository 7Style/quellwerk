import type { Request, Response } from 'express';
import { UserService } from './services/index.js';
import {
  assignRolesSchema,
  bulkDeactivateUsersSchema,
  createOtpUserSchema,
  createUserSchema,
  queryUserSchema,
  registerUserSchema,
  updateMeSchema,
  updatePasswordSchema,
  updateUserSchema,
} from './dto/index.js';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '../../common/exceptions/index.js';

function parseId(value: unknown, label = 'Benutzer-ID'): number {
  const id = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException(`Ungültige ${label}`);
  }
  return id;
}

function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) {
    throw new UnauthorizedException('Nicht authentifiziert');
  }
  return req.user;
}

/**
 * Users controller. Handlers are plain async methods: Express 5 forwards
 * rejected promises to the error middleware, and zod errors become 400s.
 */
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Public self-registration (OTP onboarding)
   * POST /api/users/register
   */
  async register(req: Request, res: Response): Promise<void> {
    const dto = registerUserSchema.parse(req.body ?? {});
    const user = await this.userService.create(dto);

    res.status(201).json({
      success: true,
      data: user,
      message:
        'Benutzer erfolgreich erstellt. Bitte prüfen Sie Ihre E‑Mail zur Verifizierung.',
    });
  }

  /**
   * Create a new user (admin)
   * POST /api/users
   */
  async create(req: Request, res: Response): Promise<void> {
    const dto = createUserSchema.parse(req.body ?? {});
    const user = await this.userService.create(dto);

    res.status(201).json({
      success: true,
      data: user,
      message:
        'Benutzer erfolgreich erstellt. Bitte prüfen Sie Ihre E‑Mail zur Verifizierung.',
    });
  }

  /**
   * Get all users
   * GET /api/users
   */
  async findAll(req: Request, res: Response): Promise<void> {
    const query = queryUserSchema.parse(req.query);
    const result = await this.userService.findAll(query);

    res.json({
      success: true,
      ...result,
    });
  }

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  async findById(req: Request, res: Response): Promise<void> {
    const userId = parseId(req.params.id);
    const user = await this.userService.findById(userId);

    res.json({
      success: true,
      data: user,
    });
  }

  /**
   * Update user
   * PUT /api/users/:id
   */
  async update(req: Request, res: Response): Promise<void> {
    const userId = parseId(req.params.id);
    const dto = updateUserSchema.parse(req.body ?? {});
    const user = await this.userService.update(userId, dto);

    res.json({
      success: true,
      data: user,
      message: 'Benutzer erfolgreich aktualisiert',
    });
  }

  /**
   * Delete user
   * DELETE /api/users/:id
   */
  async delete(req: Request, res: Response): Promise<void> {
    const userId = parseId(req.params.id);

    // Prevent self-deletion
    if (req.user && req.user.id === userId) {
      throw new ForbiddenException('Sie können Ihren eigenen Benutzer nicht löschen');
    }

    await this.userService.delete(userId);

    res.json({
      success: true,
      message: 'Benutzer erfolgreich gelöscht',
    });
  }

  /**
   * Update current user's password
   * PUT /api/users/me/password
   */
  async updateMyPassword(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const dto = updatePasswordSchema.parse(req.body ?? {});
    await this.userService.updatePassword(user.id, dto);

    res.json({
      success: true,
      message: 'Passwort erfolgreich geändert. Bitte melden Sie sich erneut an.',
    });
  }

  /**
   * Update user's password (admin only)
   * PUT /api/users/:id/password
   */
  async updateUserPassword(req: Request, res: Response): Promise<void> {
    const userId = parseId(req.params.id);
    const dto = updatePasswordSchema.parse(req.body ?? {});
    await this.userService.updatePassword(userId, dto);

    res.json({
      success: true,
      message: 'Passwort erfolgreich geändert',
    });
  }

  /**
   * Assign roles to user
   * POST /api/users/:id/roles
   */
  async assignRoles(req: Request, res: Response): Promise<void> {
    const userId = parseId(req.params.id);
    const { roleIds } = assignRolesSchema.parse(req.body ?? {});

    await this.userService.assignRoles(userId, roleIds);

    res.json({
      success: true,
      message: 'Rollen erfolgreich zugewiesen',
    });
  }

  /**
   * Remove role from user
   * DELETE /api/users/:id/roles/:roleId
   */
  async removeRole(req: Request, res: Response): Promise<void> {
    const userId = parseId(req.params.id);
    const roleId = parseId(req.params.roleId, 'Rollen-ID');

    await this.userService.removeRole(userId, roleId);

    res.json({
      success: true,
      message: 'Rolle erfolgreich entfernt',
    });
  }

  /**
   * Get user statistics
   * GET /api/users/statistics
   */
  async getStatistics(_req: Request, res: Response): Promise<void> {
    const stats = await this.userService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  }

  /**
   * Get all available roles
   * GET /api/users/roles
   */
  async getRoles(_req: Request, res: Response): Promise<void> {
    const roles = await this.userService.getAllRoles();

    res.json({
      success: true,
      data: roles,
    });
  }

  /**
   * Get departments and login modes metadata
   * GET /api/users/metadata
   */
  async getMetadata(_req: Request, res: Response): Promise<void> {
    const departments = [
      { id: 'IC', name: 'Innovation Consulting', code: 'IC' },
      { id: 'PM', name: 'Project Management', code: 'PM' },
    ];

    const loginModes = [
      {
        value: 'standard',
        label: 'Standard (Password)',
        description: 'Traditional username and password authentication',
      },
      {
        value: 'two_factor',
        label: 'Two-Factor Authentication',
        description: 'Enhanced security with 2FA code',
      },
      {
        value: 'one_time_password',
        label: 'One-Time Password (OTP)',
        description: 'Email-based one-time password for each login',
      },
    ];

    res.json({
      success: true,
      data: {
        departments,
        loginModes,
      },
    });
  }

  /**
   * Get current user profile
   * GET /api/users/me
   */
  async getMe(req: Request, res: Response): Promise<void> {
    const currentUser = requireUser(req);
    const user = await this.userService.findById(currentUser.id);

    res.json({
      success: true,
      data: user,
    });
  }

  /**
   * Update current user profile
   * PUT /api/users/me
   */
  async updateMe(req: Request, res: Response): Promise<void> {
    const currentUser = requireUser(req);
    // Privileged fields (password, roles, flags, login mode) are not part of the schema
    const dto = updateMeSchema.parse(req.body ?? {});
    const user = await this.userService.update(currentUser.id, dto);

    res.json({
      success: true,
      data: user,
      message: 'Profil erfolgreich aktualisiert',
    });
  }

  /**
   * Create OTP user and send login link
   * POST /api/users/otp
   */
  async createOtpUser(req: Request, res: Response): Promise<void> {
    const dto = createOtpUserSchema.parse(req.body ?? {});
    const result = await this.userService.createOtpUser(dto);

    res.status(201).json({
      success: result.success,
      message: result.message,
    });
  }

  /**
   * Bulk deactivate users
   * POST /api/users/bulk-deactivate
   */
  async bulkDeactivate(req: Request, res: Response): Promise<void> {
    const { userIds } = bulkDeactivateUsersSchema.parse(req.body ?? {});
    const result = await this.userService.bulkDeactivate(userIds);

    res.json({
      success: result.success,
      data: {
        deactivatedCount: result.deactivatedCount,
      },
      message: `${result.deactivatedCount} user(s) deactivated successfully`,
    });
  }
}
