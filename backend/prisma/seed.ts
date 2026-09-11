/**
 * Database seed: the demo notebook.
 *
 * It is built from `backend/evals/corpus/`, the same four files the golden set
 * is written against. One tree of files, not two with the same text in them: a
 * demo that drifts from the corpus would be a demo of something the evals never
 * measured.
 *
 * What this script does NOT do is call a model. It extracts, normalises and
 * writes; the token counts stay at zero until `scripts/recount-tokens.ts`
 * measures them on a real request. That keeps seeding runnable without an API
 * key, and it keeps the distinction honest: a count is a measurement, not
 * content.
 *
 * Idempotent. Running it twice leaves one demo notebook with four sources.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { extract } from '../app/modules/sources/internal/extract.js';
import { Prisma, PrismaClient } from '../app/generated/prisma/client.js';
import { env } from '../app/config/env.config.js';
import { loadCorpusFiles, type CorpusEntry } from './seed-data/corpus.js';

if (env.NODE_ENV === 'production') {
  console.error('Seeding is disabled in production (NODE_ENV=production).');
  process.exit(1);
}

/**
 * Fixed, and short enough to type. It is the id in the link the reviewer is
 * given, so it is not a uuid; both route schemas allow this one exception.
 */
const DEMO_ID = 'demo';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

async function seedSource(entry: CorpusEntry, position: number): Promise<number> {
  const { text, pages } = await extract(entry.kind, entry.data);

  // Deterministic ids, so a second run updates the same rows instead of adding
  // four more. `demo-1` and not a uuid for the same reason the notebook has a
  // fixed id: it is data somebody reads while debugging.
  const id = `${DEMO_ID}-${position}`;

  await prisma.source.upsert({
    where: { id },
    create: {
      id,
      notebookId: DEMO_ID,
      position,
      title: entry.title,
      kind: entry.kind,
      url: entry.source ?? null,
      originalName: entry.file,
      text,
      charCount: text.length,
      // Measured by scripts/recount-tokens.ts, not here.
      tokenCount: 0,
      // Prisma types a Json column as InputJsonValue, which an array of a named
      // interface does not satisfy structurally. The cast is at the boundary to
      // the database and nowhere else.
      pages: pages as unknown as Prisma.InputJsonValue,
      status: 'ready',
    },
    update: {
      position,
      title: entry.title,
      text,
      charCount: text.length,
      pages: pages as unknown as Prisma.InputJsonValue,
      status: 'ready',
      error: null,
      step: null,
    },
  });

  return text.length;
}

async function main(): Promise<void> {
  const corpus = await loadCorpusFiles();

  await prisma.notebook.upsert({
    where: { id: DEMO_ID },
    create: {
      id: DEMO_ID,
      // Nobody's. It is readable by every session and written by none; the
      // first write copies it into the caller's own session (M7-T1).
      sessionId: null,
      title: 'EU-KI-Verordnung',
      emoji: '⚖️',
      isDemo: true,
    },
    update: { isDemo: true, sessionId: null },
  });

  let chars = 0;
  for (const [index, entry] of corpus.entries()) {
    chars += await seedSource(entry, index + 1);
  }

  const sources = await prisma.source.count({ where: { notebookId: DEMO_ID } });

  console.log(`Seed: notebook "${DEMO_ID}" with ${sources} ready sources, ${chars.toLocaleString('en-US')} characters.`);
  console.log('Token counts are zero until scripts/recount-tokens.ts measures them.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
