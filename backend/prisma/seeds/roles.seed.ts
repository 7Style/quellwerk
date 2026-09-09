/**
 * Roles Seed - 7Style Boilerplate Monolith
 * 
 * Core roles for the boilerplate authentication system.
 * These roles provide a solid foundation for RBAC.
 */

import type { PrismaClient, Role } from '../../app/generated/prisma/client.js';

export const rolesSeed: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    nameGerman: 'Super Administrator',
    description: 'Full system access - manages users, roles, settings, and audit logs',
    isSystemRole: true,
  },
  {
    code: 'ADMIN',
    name: 'Administrator',
    nameGerman: 'Administrator',
    description: 'Administrative access - manages users and content',
    isSystemRole: true,
  },
  {
    code: 'MODERATOR',
    name: 'Moderator',
    nameGerman: 'Moderator',
    description: 'Content moderation and user support',
    isSystemRole: false,
  },
  {
    code: 'USER',
    name: 'User',
    nameGerman: 'Benutzer',
    description: 'Standard user with basic access rights',
    isSystemRole: false,
  },
  {
    code: 'GUEST',
    name: 'Guest',
    nameGerman: 'Gast',
    description: 'Limited read-only access',
    isSystemRole: false,
  },
];

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  console.log('🎭 Seeding roles...');

  for (const role of rolesSeed) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        nameGerman: role.nameGerman,
        description: role.description,
        isSystemRole: role.isSystemRole,
      },
      create: role,
    });
  }

  console.log(`   ✅ ${rolesSeed.length} roles created`);
}


