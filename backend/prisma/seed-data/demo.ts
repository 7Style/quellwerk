/**
 * The part of the demo notebook that a model wrote once.
 *
 * The four source texts come out of `backend/evals/corpus/` and cost nothing to
 * produce. The guides and the overview do not: they are model output, one call
 * per source plus one over the notebook. Generating them at seed time would
 * mean paying for them again on every machine that seeds - and on the server,
 * where the point of seeding is to reproduce a known state, it would produce a
 * slightly different one every time.
 *
 * So they are generated once by `backend/scripts/make-demo-data.ts`, checked in
 * as `demo.json`, and the seed only writes them. The file says when it was
 * made, by which models and what it cost, because a checked-in artefact of a
 * model call without that line is a file nobody can date.
 *
 * Regenerate it when the corpus changes, the guide prompt changes or the
 * overview prompt changes. Nothing checks that for you: `--check` on
 * `demo-reset.ts` compares the database against this file, not this file
 * against the prompts.
 */
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { sourceGuideSchema } from '../../app/modules/sources/internal/ingest.job.js';

/**
 * Fixed, and short enough to type. It is the id in the link the reviewer is
 * given, so it is not a uuid; both notebook route schemas allow this one
 * exception (`notebookIdSchema`, `notebookIdParamSchema`).
 */
export const DEMO_ID = 'demo';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const demoDataSchema = z.object({
  /** When the calls were made. ISO date, not a timestamp: a day is enough. */
  generatedAt: z.string(),
  /** Which models wrote this, so a stale file is recognisable as stale. */
  models: z.object({ guide: z.string(), overview: z.string() }),
  /** What the generating run cost, in micro-cents, as `usage_log` counts it. */
  costMicroCents: z.number().int().nonnegative(),
  notebook: z.object({
    title: z.string(),
    emoji: z.string(),
    summary: z.string(),
    themes: z.array(z.string()),
    suggestedQuestions: z.array(z.string()),
  }),
  /** Which model counted the tokens below. They differ per tokeniser. */
  tokenModel: z.string(),
  /** Keyed by corpus file name, the same key the manifest uses. */
  sources: z.array(
    z.object({
      file: z.string(),
      guide: sourceGuideSchema,
      /**
       * What `count_tokens` reported for this source, measured once.
       *
       * A count is a measurement and not content, which is why the seed used to
       * leave it at zero and `scripts/recount-tokens.ts` filled it in. It is in
       * here anyway, because the alternative on the server is a demo notebook
       * that reports zero tokens - and the capacity gate reads that number, so
       * it would accept a fifth source into a notebook that is already full.
       * The endpoint is free; what is saved is a step somebody has to remember.
       */
      tokens: z.number().int().nonnegative(),
    })
  ),
});

export type DemoData = z.infer<typeof demoDataSchema>;

/**
 * The id of a seeded source: a uuid, derived from the corpus file name.
 *
 * A uuid because `sourceIdParamSchema` is `z.uuid()`, and the demo notebook is
 * the notebook every visitor sees: with `demo-1` in the table, the text route
 * answered 400 and every chip in the demo opened "The document could not be
 * loaded" (found in the M6 close).
 *
 * Derived rather than random, so a second seed updates the four rows instead of
 * adding four more. From the file name and not the position, so inserting a
 * source into the middle of the manifest does not renumber the ids of the
 * sources after it - which would orphan every citation that points at them.
 *
 * SHA-256 folded into the v5 shape: v5 is "name-based", which is exactly what
 * this is. It is not RFC 4122 v5 (that hashes a namespace uuid with SHA-1); the
 * version nibble says name-based and the string is a valid uuid, which is all
 * the schema and Postgres ask for.
 */
export function demoSourceId(file: string): string {
  const hex = createHash('sha256').update(`quellwerk.demo.source.${file}`, 'utf8').digest('hex');

  const version = `5${hex.slice(13, 16)}`;
  // Variant bits: the first hex digit of the fourth group must be 8, 9, a or b.
  const variant = `${'89ab'[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}`;

  return [hex.slice(0, 8), hex.slice(8, 12), version, variant, hex.slice(20, 32)].join('-');
}

/**
 * Found by walking up, not by counting `..`.
 *
 * The same reason `corpus.ts` does it: in a checkout this file sits at
 * backend/prisma/seed-data, compiled it sits at dist/prisma/seed-data, and the
 * json is at prisma/seed-data in both the checkout and the image. A fixed
 * number of `..` is right in exactly one of the two.
 */
async function findDemoFile(): Promise<string> {
  const searched: string[] = [];
  let current = HERE;

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(current, 'prisma', 'seed-data', 'demo.json');
    searched.push(candidate);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new Error(
    `demo.json not found; looked in ${searched.join(', ')}. ` +
      'Generate it with: pnpm --filter @quellwerk/backend exec tsx scripts/make-demo-data.ts'
  );
}

/**
 * Reads the file, or says what to run.
 *
 * It throws rather than seeding without it. A demo notebook whose sources have
 * no guide is the bug this file exists to fix: `languageOf` finds no language,
 * falls back to English, and the German demo writes an English report.
 */
export async function loadDemoData(fileOverride?: string): Promise<DemoData> {
  const file = fileOverride ?? (await findDemoFile());
  return demoDataSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

export async function demoDataPath(): Promise<string> {
  return findDemoFile();
}
