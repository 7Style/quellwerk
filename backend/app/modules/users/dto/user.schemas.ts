/**
 * Users module - request validation schemas (zod 4).
 *
 * Every schema is the single source of truth for the DTO type (`z.infer`).
 * Controllers call `schema.parse(...)`; a ZodError is mapped to HTTP 400 by
 * the global error middleware.
 */
import { z } from 'zod';

export const loginSecurityModeSchema = z.enum(['none', 'two_factor', 'one_time_password']);
export const preferredLanguageSchema = z.enum(['en', 'de']);
export const userSortBySchema = z.enum(['createdAt', 'updatedAt', 'email', 'firstName', 'lastName']);
export const sortOrderSchema = z.enum(['asc', 'desc']);

export type LoginSecurityMode = z.infer<typeof loginSecurityModeSchema>;
export type PreferredLanguage = z.infer<typeof preferredLanguageSchema>;
export type UserSortBy = z.infer<typeof userSortBySchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;

const emailSchema = z
  .email()
  .max(255)
  .transform((value) => value.trim().toLowerCase());
const nameSchema = z.string().trim().min(1).max(100);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const passwordSchema = z.string().min(8).max(128);
const positiveInt = z.coerce.number().int().positive();
const roleIdsSchema = z.array(positiveInt).max(50);

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------

/** Admin user creation (POST /api/users) */
export const createUserSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalText(50),
  department: optionalText(100),
  position: optionalText(100),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  roleIds: roleIdsSchema.optional(),
  preferredLanguage: preferredLanguageSchema.optional(),
  loginSecurityMode: loginSecurityModeSchema.optional(),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

/** Public self-registration (POST /api/users/register): no roles or flags from the client */
export const registerUserSchema = createUserSchema.omit({
  roleIds: true,
  isActive: true,
  emailVerified: true,
  loginSecurityMode: true,
});
export type RegisterUserDto = z.infer<typeof registerUserSchema>;

/** OTP user creation (POST /api/users/otp) */
export const createOtpUserSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  roleIds: roleIdsSchema.optional(),
  department: optionalText(100),
  phone: optionalText(50),
  loginSecurityMode: loginSecurityModeSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CreateOtpUserDto = z.infer<typeof createOtpUserSchema>;

// -----------------------------------------------------------------------------
// Update
// -----------------------------------------------------------------------------

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: optionalText(50),
  department: optionalText(100),
  position: optionalText(100),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  roleIds: roleIdsSchema.optional(),
  preferredLanguage: preferredLanguageSchema.optional(),
  loginSecurityMode: loginSecurityModeSchema.optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

/**
 * Self-service profile update (PUT /api/users/me): no privileged fields. The
 * e-mail address is excluded as well: an access token (15 min, localStorage)
 * must not be enough to redirect reset links, OTP codes and 2FA notices to
 * another mailbox. Address changes are an admin action (PUT /api/users/:id).
 */
export const updateMeSchema = updateUserSchema.omit({
  email: true,
  password: true,
  roleIds: true,
  isActive: true,
  emailVerified: true,
  loginSecurityMode: true,
});
export type UpdateMeDto = z.infer<typeof updateMeSchema>;

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;

export const assignRolesSchema = z.object({
  roleIds: roleIdsSchema.min(1),
});
export type AssignRolesDto = z.infer<typeof assignRolesSchema>;

export const bulkDeactivateUsersSchema = z.object({
  userIds: z.array(positiveInt).min(1).max(500),
});
export type BulkDeactivateUsersDto = z.infer<typeof bulkDeactivateUsersSchema>;

// -----------------------------------------------------------------------------
// Query
// -----------------------------------------------------------------------------

/** GET /api/users query string (values arrive as strings) */
export const queryUserSchema = z.object({
  search: z.string().trim().max(200).optional(),
  email: z.string().trim().max(255).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(),
  isActive: z.stringbool().optional(),
  emailVerified: z.stringbool().optional(),
  roleId: positiveInt.optional(),
  roleCode: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: userSortBySchema.default('createdAt'),
  sortOrder: sortOrderSchema.default('desc'),
});
export type QueryUserDto = z.infer<typeof queryUserSchema>;
