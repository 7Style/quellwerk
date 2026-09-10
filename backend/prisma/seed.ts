/**
 * Database seed.
 *
 * The demo notebook with the fixed id `demo` arrives in M2-T5 and is built from
 * the files under backend/evals/corpus/, the same tree the golden set is written
 * against. Until then this script exists so `prisma db seed` has an entry point
 * and the container start does not fail when SEED_ON_START is true.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../app/generated/prisma/client.js';
import { env } from '../app/config/env.config.js';

if (env.NODE_ENV === 'production') {
  console.error('Seeding is disabled in production (NODE_ENV=production).');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const notebooks = await prisma.notebook.count();
  console.log(`Seed: nothing to do yet, ${notebooks} notebook(s) in the database.`);
  console.log('The demo notebook is seeded in M2-T5 from backend/evals/corpus/.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
