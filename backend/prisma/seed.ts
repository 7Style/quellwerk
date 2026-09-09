/**
 * Database Seed Entry Point - 7Style Boilerplate Monolith
 *
 * Seeds the database with essential data for the boilerplate.
 * Run with: pnpm --filter bp-monolith-backend run prisma:seed
 *
 * Seeding is refused in production. The admin password comes from
 * SEED_ADMIN_PASSWORD (see backend/example.env).
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../app/generated/prisma/client.js';
import { env } from '../app/config/env.config.js';
import { seedRoles } from './seeds/roles.seed.js';
import { seedPermissions } from './seeds/permissions.seed.js';
import { seedRolePermissions } from './seeds/role-permissions.seed.js';
import { seedUsers } from './seeds/users.seed.js';

if (env.NODE_ENV === 'production') {
  console.error('Seeding is disabled in production (NODE_ENV=production).');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     🌱 7Style Boilerplate Monolith - Database Seeding     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Seed in correct order (dependencies first)
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await seedUsers(prisma);

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              ✅ Seeding completed successfully!           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║                  ❌ Seeding failed!                       ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Error:', error);
    throw error;
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
