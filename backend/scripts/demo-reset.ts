/**
 * Puts the demo notebook back the way it was seeded, or says whether it already is.
 *
 *   pnpm --filter @quellwerk/backend exec tsx scripts/demo-reset.ts --check
 *   pnpm --filter @quellwerk/backend exec tsx scripts/demo-reset.ts
 *
 * In the container, where tsx is not installed:
 *
 *   docker compose exec backend node dist/scripts/demo-reset.js --check
 *
 * `--check` writes nothing and exits 1 on the first difference, which is what
 * makes it usable after a deploy and in the M8-T1 test command. Without it the
 * script re-seeds: the four sources, the guides, the overview, and away go the
 * reports and turns a visitor left behind.
 *
 * Why this exists at all: the demo notebook is the first thing anybody sees,
 * and by the time it is shown it has been clicked on. A report somebody
 * requested an hour ago is not wrong, but it is not the state the link
 * promises either.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../app/generated/prisma/client.js';
import { env } from '../app/config/env.config.js';
import { checkDemo, DEMO_ID, seedDemo } from '../prisma/seed-demo.js';

const check = process.argv.includes('--check');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

async function main(): Promise<void> {
  if (check) {
    const result = await checkDemo(prisma);
    console.log(`Demo notebook "${DEMO_ID}", against the seeded state:\n`);
    for (const line of result.lines) console.log(`  ${line}`);
    console.log('');

    if (!result.ok) {
      console.error('Not the seeded state. Run the same script without --check to restore it.');
      process.exitCode = 1;
      return;
    }
    console.log('The demo notebook is exactly as seeded.');
    return;
  }

  const report = await seedDemo(prisma);
  const { sources, messages, artifacts } = report.removed;

  console.log(`Demo notebook "${DEMO_ID}" restored:`);
  console.log(
    `  ${report.sources.length} sources, ${report.tokens.toLocaleString('en-US')} tokens, ` +
      `${report.data.notebook.suggestedQuestions.length} questions`
  );
  console.log(`  removed: ${sources} stray source(s), ${messages} turn(s), ${artifacts} report(s)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
