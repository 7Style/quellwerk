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
// `migrate diff --from-migrations` replays the migrations into a throwaway
// database and needs its own URL; the CLI does not accept it as a flag in
// Prisma 7. Defaults to the same server with a _shadow suffix.
const shadowDatabaseUrl =
  process.env.SHADOW_DATABASE_URL ??
  (databaseUrl ? databaseUrl.replace(/\/([^/?]+)(\?|$)/, '/$1_shadow$2') : undefined);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl
    ? { datasource: { url: databaseUrl, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } }
    : {}),
});
