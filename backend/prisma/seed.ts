/**
 * Database seed: the demo notebook.
 *
 * It is built from `backend/evals/corpus/`, the same four files the golden set
 * is written against, plus `seed-data/demo.json` for the part a model wrote.
 * One tree of files, not two with the same text in them: a demo that drifts
 * from the corpus would be a demo of something the evals never measured.
 *
 * What this script does NOT do is call a model. The guides, the overview and
 * the token counts were measured once by `scripts/make-demo-data.ts` and are
 * checked in, so seeding needs no key, costs nothing, and produces the same
 * notebook here and on the server. That last part is the point: a demo that is
 * regenerated per machine is not a demo anybody can reproduce.
 *
 * Idempotent. Running it twice leaves one demo notebook with four sources, and
 * it also cleans up: a source in this notebook that the seed did not write is
 * removed, which is how the old `demo-1` rows disappear.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../app/generated/prisma/client.js';
import { env } from '../app/config/env.config.js';
import { DEMO_ID, seedDemo } from './seed-demo.js';

/**
 * Production needs the flag, and gets one line about what it will do.
 *
 * The guard is against a seed nobody typed - `SEED_ON_START=true` left in an
 * environment file, which the entrypoint also refuses in production - and not
 * against the operator who runs it deliberately. On the server this is exactly
 * how the demo notebook is restored:
 *
 *   docker compose -f deployment/prod/docker/docker-compose.yml \
 *     exec backend node dist/prisma/seed.js --yes-production
 */
const FLAG = '--yes-production';

if (env.NODE_ENV === 'production' && !process.argv.includes(FLAG)) {
  console.error(
    `Seeding is disabled in production. It rewrites the "${DEMO_ID}" notebook and deletes every\n` +
      `report and turn in it; no other notebook is touched. Run it with ${FLAG} if that is what\n` +
      'you want.'
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const report = await seedDemo(prisma);

  console.log(`Seed: notebook "${DEMO_ID}" - ${report.data.notebook.title}`);
  for (const source of report.sources) {
    console.log(
      `  ${source.position}. ${source.title}\n` +
        `     ${source.kind}, ${source.chars.toLocaleString('en-US')} characters, ` +
        `${source.tokens.toLocaleString('en-US')} tokens, ${source.language}, id ${source.id}`
    );
  }

  console.log(
    `  overview: ${report.data.notebook.themes.length} themes, ` +
      `${report.data.notebook.suggestedQuestions.length} questions ` +
      `(generated ${report.data.generatedAt} by ${report.data.models.overview})`
  );
  console.log(`  ${report.tokens.toLocaleString('en-US')} tokens in total`);

  const { sources, messages, artifacts } = report.removed;
  if (sources + messages + artifacts > 0) {
    console.log(
      `  removed: ${sources} source(s) the seed did not write, ${messages} turn(s), ${artifacts} report(s)`
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
