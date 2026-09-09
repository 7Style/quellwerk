/**
 * Prisma 7 CLI configuration (migrate, db, studio, generate).
 * The CLI no longer loads .env on its own, so it is loaded here explicitly.
 *
 * `prisma generate` needs no database (Docker build stage), therefore the
 * datasource block is only added when DATABASE_URL is present; every command
 * that needs a connection (migrate, db seed, studio) fails loudly without it.
 */
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadDotenv({ quiet: true });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
