/**
 * Users Seed - 7Style Boilerplate Monolith
 *
 * Creates the initial SUPER_ADMIN account. The password is never committed:
 * it comes from SEED_ADMIN_PASSWORD (mandatory outside NODE_ENV=test).
 *
 * Optional demo accounts (moderator/user/inactive) are only created when
 * SEED_DEMO_USERS=true and SEED_DEMO_PASSWORD is set.
 */

import bcrypt from 'bcrypt';
import type { PrismaClient } from '../../app/generated/prisma/client.js';
import { env } from '../../app/config/env.config.js';

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  isActive: boolean;
}

function buildSeedUsers(): SeedUser[] {
  const users: SeedUser[] = [];

  const adminPassword = env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    if (env.NODE_ENV === 'test') {
      console.log('   SEED_ADMIN_PASSWORD not set, skipping user seeding (test environment)');
      return users;
    }
    throw new Error(
      'SEED_ADMIN_PASSWORD is required to seed the admin user (min 12 characters). ' +
        'Set it in backend/.env (host) or in the root .env (docker compose).'
    );
  }

  users.push({
    email: env.SEED_ADMIN_EMAIL,
    password: adminPassword,
    firstName: 'Super',
    lastName: 'Admin',
    roleCode: 'SUPER_ADMIN',
    isActive: true,
  });

  if (env.SEED_DEMO_USERS) {
    const demoPassword = env.SEED_DEMO_PASSWORD;
    if (!demoPassword) {
      throw new Error('SEED_DEMO_PASSWORD is required when SEED_DEMO_USERS=true (min 12 characters).');
    }

    const domain = env.SEED_ADMIN_EMAIL.split('@')[1] ?? 'quellwerk.local';
    users.push(
      {
        email: `moderator@${domain}`,
        password: demoPassword,
        firstName: 'Max',
        lastName: 'Moderator',
        roleCode: 'MODERATOR',
        isActive: true,
      },
      {
        email: `user@${domain}`,
        password: demoPassword,
        firstName: 'John',
        lastName: 'Doe',
        roleCode: 'USER',
        isActive: true,
      },
      {
        email: `inactive@${domain}`,
        password: demoPassword,
        firstName: 'Inactive',
        lastName: 'User',
        roleCode: 'USER',
        isActive: false,
      }
    );
  }

  return users;
}

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  // SECURITY: never seed accounts in production
  if (env.NODE_ENV === 'production') {
    console.log('   Skipping user seeding in production environment');
    return;
  }

  const seedUsersList = buildSeedUsers();
  if (seedUsersList.length === 0) {
    return;
  }

  console.log('   Seeding users...');

  for (const seedUser of seedUsersList) {
    const role = await prisma.role.findUnique({
      where: { code: seedUser.roleCode },
    });

    if (!role) {
      console.warn(`   ⚠️  Role ${seedUser.roleCode} not found, skipping user ${seedUser.email}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(seedUser.password, env.BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        isActive: seedUser.isActive,
        password: passwordHash,
      },
      create: {
        email: seedUser.email,
        password: passwordHash,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        isActive: seedUser.isActive,
        emailVerified: true,
      },
    });

    // Assign role to user
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });
  }

  console.log(`   ${seedUsersList.length} user(s) created/updated`);
  console.log('');
  console.log('   Accounts:');
  console.log('   -------------------------------------------');
  seedUsersList.forEach((u) => {
    console.log(`   ${u.roleCode.padEnd(12)} | ${u.email}`);
  });
  console.log('   -------------------------------------------');
  console.log('   Passwords come from SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD');
}
