/**
 * Permissions Seed - 7Style Boilerplate Monolith
 * 
 * Core permissions for the boilerplate modules:
 * - Users
 * - Auth
 * - Audit
 * - Upload
 * - System
 */

import type { PrismaClient, Permission } from '../../app/generated/prisma/client.js';

export const permissionsSeed: Omit<Permission, 'id' | 'createdAt'>[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM MODULE
  // ─────────────────────────────────────────────────────────────────────────────
  { module: 'system', resource: 'settings', action: 'read', description: 'View system settings' },
  { module: 'system', resource: 'settings', action: 'write', description: 'Modify system settings' },
  { module: 'system', resource: 'health', action: 'read', description: 'View system health status' },

  // ─────────────────────────────────────────────────────────────────────────────
  // USERS MODULE
  // ─────────────────────────────────────────────────────────────────────────────
  { module: 'users', resource: 'users', action: 'create', description: 'Create new users' },
  { module: 'users', resource: 'users', action: 'read', description: 'View user details' },
  { module: 'users', resource: 'users', action: 'update', description: 'Update user information' },
  { module: 'users', resource: 'users', action: 'delete', description: 'Delete users' },
  { module: 'users', resource: 'users', action: 'list', description: 'List all users' },
  { module: 'users', resource: 'roles', action: 'assign', description: 'Assign roles to users' },
  { module: 'users', resource: 'profile', action: 'read', description: 'View own profile' },
  { module: 'users', resource: 'profile', action: 'update', description: 'Update own profile' },

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH MODULE
  // ─────────────────────────────────────────────────────────────────────────────
  { module: 'auth', resource: 'sessions', action: 'read', description: 'View active sessions' },
  { module: 'auth', resource: 'sessions', action: 'delete', description: 'Terminate sessions' },
  { module: 'auth', resource: '2fa', action: 'manage', description: 'Manage two-factor authentication' },
  { module: 'auth', resource: 'tokens', action: 'revoke', description: 'Revoke access tokens' },

  // ─────────────────────────────────────────────────────────────────────────────
  // AUDIT MODULE
  // ─────────────────────────────────────────────────────────────────────────────
  { module: 'audit', resource: 'logs', action: 'read', description: 'View audit logs' },
  { module: 'audit', resource: 'logs', action: 'export', description: 'Export audit logs' },
  { module: 'audit', resource: 'logs', action: 'delete', description: 'Delete audit logs' },

  // ─────────────────────────────────────────────────────────────────────────────
  // UPLOAD MODULE
  // ─────────────────────────────────────────────────────────────────────────────
  { module: 'upload', resource: 'files', action: 'upload', description: 'Upload files' },
  { module: 'upload', resource: 'files', action: 'read', description: 'View/download files' },
  { module: 'upload', resource: 'files', action: 'delete', description: 'Delete files' },
  { module: 'upload', resource: 'files', action: 'list', description: 'List uploaded files' },
];

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  console.log('🔐 Seeding permissions...');

  for (const permission of permissionsSeed) {
    await prisma.permission.upsert({
      where: {
        module_resource_action: {
          module: permission.module,
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {
        description: permission.description,
      },
      create: permission,
    });
  }

  console.log(`   ✅ ${permissionsSeed.length} permissions created`);
}


