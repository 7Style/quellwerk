/**
 * Measures a notebook's sources on a real count-tokens request and writes the
 * numbers back.
 *
 *   pnpm --filter @quellwerk/backend exec tsx scripts/recount-tokens.ts demo
 *
 * The 150,000 token cap is enforced against this number (docs/SPEC.md), so it
 * has to be the number the API would bill and not characters divided by four.
 * Dense legal text tokenises differently from prose, and the difference decides
 * whether a source is accepted.
 *
 * The endpoint is free and rate limited separately from message creation, so
 * running this over a notebook costs nothing but a few seconds.
 *
 * Writing the numbers is the point, not printing them: the seed leaves every
 * count at zero, and a demo notebook that reports zero tokens would let the
 * capacity gate accept a fifth source into a notebook that is already full.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { AnthropicLlmAdapter, buildCountTokensRequest } from '../app/adapters/llm/index.js';
import { env } from '../app/config/env.config.js';
import { models } from '../app/config/models.js';
import { PrismaClient } from '../app/generated/prisma/client.js';

const notebookId = process.argv[2];

if (!notebookId) {
  console.error('Usage: tsx scripts/recount-tokens.ts <notebookId>');
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
const llm = new AnthropicLlmAdapter();

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

async function main(): Promise<void> {
  const sources = await prisma.source.findMany({
    where: { notebookId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true, title: true, kind: true, text: true, charCount: true },
  });

  if (sources.length === 0) {
    console.error(`No sources for notebook "${notebookId}". Has it been seeded?`);
    process.exit(1);
  }

  console.log(`Notebook ${notebookId}, measured on ${models.chat}\n`);
  console.log('  pos  kind   chars     tokens  chars/token  title');
  console.log('  ' + '-'.repeat(72));

  let total = 0;

  for (const source of sources) {
    // One request per source, not one for the notebook. The cap is maintained
    // as a sum of per-source counts (a source is added or removed one at a
    // time), so measuring the same way keeps the stored total and the numbers
    // it is made of consistent.
    const tokens = await llm.countTokens(
      buildCountTokensRequest({
        model: models.chat,
        sources: [
          {
            id: source.id,
            position: source.position,
            title: source.title,
            kind: source.kind,
            text: source.text,
          },
        ],
      })
    );

    await prisma.source.update({ where: { id: source.id }, data: { tokenCount: tokens } });
    total += tokens;

    const ratio = tokens > 0 ? (source.charCount / tokens).toFixed(2) : '-';
    console.log(
      `  ${pad(source.position, 3)}  ${source.kind.padEnd(5)}  ${pad(source.charCount.toLocaleString('en-US'), 7)}  ${pad(tokens.toLocaleString('en-US'), 9)}  ${pad(ratio, 11)}  ${source.title.slice(0, 40)}`
    );
  }

  await prisma.notebook.update({
    where: { id: notebookId },
    data: { tokenCount: total, tokenModel: models.chat },
  });

  const cap = env.MAX_TOKENS_PER_NOTEBOOK;
  const share = ((total / cap) * 100).toFixed(1);

  console.log('  ' + '-'.repeat(72));
  console.log(
    `  ${sources.length} sources, ${total.toLocaleString('en-US')} tokens, ` +
      `${share}% of the ${cap.toLocaleString('en-US')} token cap.`
  );

  // A notebook over the cap is not an error here: this script reports what is
  // true, and the gate that refuses the next source reads the same number.
  if (total > cap) {
    console.error(`\nOver the cap by ${(total - cap).toLocaleString('en-US')} tokens.`);
    process.exitCode = 1;
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
