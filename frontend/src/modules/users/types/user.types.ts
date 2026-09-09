/**
 * User entity from API
 */
export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  department?: string;
  position?: string;
  isActive: boolean;
  emailVerified: boolean;
  preferredLanguage: 'en' | 'de';
  loginSecurityMode: 'none' | 'two_factor' | 'one_time_password';
  mentorId?: number;
  absenceSubstituteId?: number;
  clientId?: number;
  bookingsLink?: string;
  createdAt: string;
  updatedAt: string;
  roles?: Role[];
}

/**
 * Role entity
 */
export interface Role {
  id: number;
  name: string;
  code: string;
  description?: string;
}

/**
 * Department metadata
 */
export interface Department {
  id: string;
  name: string;
  code: string;
}

/**
 * Login mode metadata
 */
export interface LoginMode {
  value: string;
  label: string;
  description: string;
}

/**
 * User metadata response
 */
export interface UserMetadata {
  departments: Department[];
  loginModes: LoginMode[];
}

/**
 * User statistics
 */
export interface UserStatistics {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
}

/**
 * Sort options for user queries
 */
export type UserSortBy = 'createdAt' | 'updatedAt' | 'email' | 'firstName' | 'lastName';
export type SortOrder = 'asc' | 'desc';

/**
 * Query parameters for fetching users
 */
export interface QueryUserParams {
  search?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  roleId?: number;
  roleCode?: string;
  clientId?: number;
  page?: number;
  limit?: number;
  sortBy?: UserSortBy;
  sortOrder?: SortOrder;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Single item response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * Create user payload
 */
export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  department?: string;
  position?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  roleIds?: number[];
  clientId?: number;
  preferredLanguage?: 'en' | 'de';
  loginSecurityMode?: 'none' | 'two_factor' | 'one_time_password';
  mentorId?: number;
  absenceSubstituteId?: number;
}

/**
 * Update user payload
 */
export interface UpdateUserDto {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  department?: string;
  position?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  roleIds?: number[];
  clientId?: number;
  preferredLanguage?: 'en' | 'de';
  loginSecurityMode?: 'none' | 'two_factor' | 'one_time_password';
  mentorId?: number;
  absenceSubstituteId?: number;
  bookingsLink?: string;
}

/**
 * Update password payload
 */
export interface UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}

/**
 * Assign roles payload
 */
export interface AssignRolesDto {
  roleIds: number[];
}

/**
 * Bulk deactivate payload
 */
export interface BulkDeactivateDto {
  userIds: number[];
}
