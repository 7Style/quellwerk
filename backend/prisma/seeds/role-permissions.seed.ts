/**
 * Role-Permissions Mapping Seed - 7Style Boilerplate Monolith
 * 
 * Maps permissions to roles for RBAC.
 */

import type { PrismaClient } from '../../app/generated/prisma/client.js';

interface RolePermissionMapping {
  roleCode: string;
  permissions: Array<{
    module: string;
    resource: string;
    action: string;
  }>;
}

const rolePermissionMappings: RolePermissionMapping[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // SUPER_ADMIN - Full access to everything
  // ─────────────────────────────────────────────────────────────────────────────
  {
    roleCode: 'SUPER_ADMIN',
    permissions: [
      // System
      { module: 'system', resource: 'settings', action: 'read' },
      { module: 'system', resource: 'settings', action: 'write' },
      { module: 'system', resource: 'health', action: 'read' },
      // Users
      { module: 'users', resource: 'users', action: 'create' },
      { module: 'users', resource: 'users', action: 'read' },
      { module: 'users', resource: 'users', action: 'update' },
      { module: 'users', resource: 'users', action: 'delete' },
      { module: 'users', resource: 'users', action: 'list' },
      { module: 'users', resource: 'roles', action: 'assign' },
      { module: 'users', resource: 'profile', action: 'read' },
      { module: 'users', resource: 'profile', action: 'update' },
      // Auth
      { module: 'auth', resource: 'sessions', action: 'read' },
      { module: 'auth', resource: 'sessions', action: 'delete' },
      { module: 'auth', resource: '2fa', action: 'manage' },
      { module: 'auth', resource: 'tokens', action: 'revoke' },
      // Audit
      { module: 'audit', resource: 'logs', action: 'read' },
      { module: 'audit', resource: 'logs', action: 'export' },
      { module: 'audit', resource: 'logs', action: 'delete' },
      // Upload
      { module: 'upload', resource: 'files', action: 'upload' },
      { module: 'upload', resource: 'files', action: 'read' },
      { module: 'upload', resource: 'files', action: 'delete' },
      { module: 'upload', resource: 'files', action: 'list' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN - Administrative access (no system settings)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    roleCode: 'ADMIN',
    permissions: [
      // System (read only)
      { module: 'system', resource: 'health', action: 'read' },
      // Users
      { module: 'users', resource: 'users', action: 'create' },
      { module: 'users', resource: 'users', action: 'read' },
      { module: 'users', resource: 'users', action: 'update' },
      { module: 'users', resource: 'users', action: 'list' },
      { module: 'users', resource: 'roles', action: 'assign' },
      { module: 'users', resource: 'profile', action: 'read' },
      { module: 'users', resource: 'profile', action: 'update' },
      // Auth
      { module: 'auth', resource: 'sessions', action: 'read' },
      { module: 'auth', resource: 'sessions', action: 'delete' },
      { module: 'auth', resource: '2fa', action: 'manage' },
      // Audit (read only)
      { module: 'audit', resource: 'logs', action: 'read' },
      { module: 'audit', resource: 'logs', action: 'export' },
      // Upload
      { module: 'upload', resource: 'files', action: 'upload' },
      { module: 'upload', resource: 'files', action: 'read' },
      { module: 'upload', resource: 'files', action: 'delete' },
      { module: 'upload', resource: 'files', action: 'list' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // MODERATOR - Content moderation
  // ─────────────────────────────────────────────────────────────────────────────
  {
    roleCode: 'MODERATOR',
    permissions: [
      // Users (read only)
      { module: 'users', resource: 'users', action: 'read' },
      { module: 'users', resource: 'users', action: 'list' },
      { module: 'users', resource: 'profile', action: 'read' },
      { module: 'users', resource: 'profile', action: 'update' },
      // Auth
      { module: 'auth', resource: '2fa', action: 'manage' },
      // Audit (read only)
      { module: 'audit', resource: 'logs', action: 'read' },
      // Upload
      { module: 'upload', resource: 'files', action: 'upload' },
      { module: 'upload', resource: 'files', action: 'read' },
      { module: 'upload', resource: 'files', action: 'list' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // USER - Standard user access
  // ─────────────────────────────────────────────────────────────────────────────
  {
    roleCode: 'USER',
    permissions: [
      // Profile only
      { module: 'users', resource: 'profile', action: 'read' },
      { module: 'users', resource: 'profile', action: 'update' },
      // Auth
      { module: 'auth', resource: '2fa', action: 'manage' },
      // Upload (own files)
      { module: 'upload', resource: 'files', action: 'upload' },
      { module: 'upload', resource: 'files', action: 'read' },
      { module: 'upload', resource: 'files', action: 'list' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // GUEST - Minimal read-only access
  // ─────────────────────────────────────────────────────────────────────────────
  {
    roleCode: 'GUEST',
    permissions: [
      { module: 'users', resource: 'profile', action: 'read' },
    ],
  },
];

export async function seedRolePermissions(prisma: PrismaClient): Promise<void> {
  console.log('🔗 Seeding role-permission mappings...');

  let totalMappings = 0;

  for (const mapping of rolePermissionMappings) {
    const role = await prisma.role.findUnique({
      where: { code: mapping.roleCode },
    });

    if (!role) {
      console.warn(`   ⚠️  Role ${mapping.roleCode} not found, skipping...`);
      continue;
    }

    for (const perm of mapping.permissions) {
      const permission = await prisma.permission.findUnique({
        where: {
          module_resource_action: {
            module: perm.module,
            resource: perm.resource,
            action: perm.action,
          },
        },
      });

      if (!permission) {
        console.warn(`   ⚠️  Permission ${perm.module}:${perm.resource}:${perm.action} not found`);
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });

      totalMappings++;
    }
  }

  console.log(`   ✅ ${totalMappings} role-permission mappings created`);
}


