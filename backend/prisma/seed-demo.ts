/**
 * The demo notebook, written from the corpus and from `seed-data/demo.json`.
 *
 * One function, two callers: `prisma/seed.ts` (also the `SEED_ON_START` path)
 * and `scripts/demo-reset.ts`. A reset that re-implemented the seed would drift
 * from it, and then "restored to its seeded state" would mean two states.
 *
 * What it writes is everything an ingested notebook would have: the four texts,
 * a guide per source with its language, the overview with its four questions,
 * and the token counts. What it does not write is anything a visitor produced -
 * that is the point of a reset.
 */
import { extract } from '../app/modules/sources/internal/extract.js';
import type { Prisma, PrismaClient } from '../app/generated/prisma/client.js';
import { loadCorpusFiles } from './seed-data/corpus.js';
import { DEMO_ID, demoSourceId, loadDemoData, type DemoData } from './seed-data/demo.js';

export { DEMO_ID };

export interface SeededSource {
  id: string;
  file: string;
  position: number;
  title: string;
  kind: string;
  chars: number;
  tokens: number;
  language: string;
}

export interface SeedReport {
  sources: SeededSource[];
  tokens: number;
  /** Rows that were in the demo notebook and are not part of its seeded state. */
  removed: { sources: number; messages: number; artifacts: number };
  data: DemoData;
}

/**
 * Everything the seeded state consists of, read from the two files.
 *
 * Pure: it touches no database, so `--check` can compare against it without a
 * chance of writing anything.
 */
export async function demoState(): Promise<{ data: DemoData; sources: SeededSource[] }> {
  const [corpus, data] = await Promise.all([loadCorpusFiles(), loadDemoData()]);

  const sources: SeededSource[] = [];
  for (const [index, entry] of corpus.entries()) {
    const recorded = data.sources.find((one) => one.file === entry.file);
    if (!recorded) {
      throw new Error(
        `demo.json has no guide for ${entry.file}. The corpus changed; regenerate it with ` +
          'pnpm --filter @quellwerk/backend exec tsx scripts/make-demo-data.ts'
      );
    }

    const { text } = await extract(entry.kind, entry.data);

    sources.push({
      id: demoSourceId(entry.file),
      file: entry.file,
      position: index + 1,
      title: entry.title,
      kind: entry.kind,
      chars: text.length,
      tokens: recorded.tokens,
      language: recorded.guide.language,
    });
  }

  return { data, sources };
}

export async function seedDemo(prisma: PrismaClient): Promise<SeedReport> {
  const [corpus, state] = await Promise.all([loadCorpusFiles(), demoState()]);
  const { data, sources } = state;

  await prisma.notebook.upsert({
    where: { id: DEMO_ID },
    create: {
      id: DEMO_ID,
      // Nobody's. It is readable by every session and written by none; the
      // first write copies it into the caller's own session (M7-T1).
      sessionId: null,
      isDemo: true,
      title: data.notebook.title,
      emoji: data.notebook.emoji,
      ...overviewFields(data),
    },
    update: {
      sessionId: null,
      isDemo: true,
      title: data.notebook.title,
      emoji: data.notebook.emoji,
      ...overviewFields(data),
    },
  });

  for (const [index, entry] of corpus.entries()) {
    const target = sources[index];
    const recorded = data.sources.find((one) => one.file === entry.file);
    if (!recorded) continue;
    const { text, pages } = await extract(entry.kind, entry.data);

    const row = {
      position: target.position,
      title: target.title,
      text,
      charCount: text.length,
      tokenCount: recorded.tokens,
      // Prisma types a Json column as InputJsonValue, which an array of a named
      // interface does not satisfy structurally. The cast is at the boundary to
      // the database and nowhere else.
      pages: pages as unknown as Prisma.InputJsonValue,
      guide: recorded.guide as unknown as Prisma.InputJsonValue,
      status: 'ready',
      error: null,
      step: null,
    };

    await prisma.source.upsert({
      where: { id: target.id },
      create: {
        id: target.id,
        notebookId: DEMO_ID,
        kind: target.kind,
        url: entry.source ?? null,
        originalName: entry.file,
        ...row,
      },
      update: row,
    });
  }

  // Everything else that sits in this notebook goes.
  //
  // The stray sources are the reason this exists: before this task the four
  // were `demo-1` to `demo-4`, which the text route refuses as a source id, and
  // leaving them would show eight sources in the sidebar. Messages and
  // artifacts go too - a demo notebook keeps no turns (docs/KNOWN-LIMITS.md)
  // and a report written yesterday is not part of the seeded state.
  const keep = sources.map((one) => one.id);
  const removed = {
    sources: (
      await prisma.source.deleteMany({ where: { notebookId: DEMO_ID, id: { notIn: keep } } })
    ).count,
    messages: (await prisma.message.deleteMany({ where: { notebookId: DEMO_ID } })).count,
    artifacts: (await prisma.artifact.deleteMany({ where: { notebookId: DEMO_ID } })).count,
  };

  const tokens = sources.reduce((total, one) => total + one.tokens, 0);
  await prisma.notebook.update({
    where: { id: DEMO_ID },
    data: { tokenCount: tokens, tokenModel: data.tokenModel },
  });

  return { sources, tokens, removed, data };
}

/**
 * The overview an ingested notebook would carry.
 *
 * `overviewRequestedAt` is set as well, because the debounce reads it: without
 * it the first source that is ever added to this notebook would queue an
 * overview job and pay to rewrite what is already here.
 */
function overviewFields(data: DemoData) {
  return {
    summary: data.notebook.summary,
    themes: data.notebook.themes as unknown as Prisma.InputJsonValue,
    suggestedQuestions: data.notebook.suggestedQuestions as unknown as Prisma.InputJsonValue,
    overviewRequestedAt: new Date(),
    userSetTitle: true,
  };
}

export interface CheckResult {
  ok: boolean;
  lines: string[];
}

/**
 * Compares the database against the two files, and writes nothing.
 *
 * This is what `demo-reset.ts --check` runs, and what the PLAN's test command
 * for M8-T1 asserts: seed, then check. It fails on anything a visitor would
 * notice - a missing source, a changed text, a source id that is not a uuid, a
 * missing guide, a missing overview.
 */
export async function checkDemo(prisma: PrismaClient): Promise<CheckResult> {
  const { data, sources } = await demoState();
  const lines: string[] = [];
  let ok = true;

  const fail = (line: string): void => {
    ok = false;
    lines.push(`FAIL  ${line}`);
  };
  const pass = (line: string): void => {
    lines.push(`ok    ${line}`);
  };
  const expect = (condition: boolean, good: string, bad: string): void => {
    if (condition) pass(good);
    else fail(bad);
  };

  const notebook = await prisma.notebook.findUnique({ where: { id: DEMO_ID } });
  if (!notebook) {
    fail(`notebook "${DEMO_ID}" does not exist`);
    return { ok, lines };
  }

  expect(notebook.isDemo, 'notebook is marked as the demo', 'notebook is not isDemo');
  expect(
    notebook.sessionId === null,
    'notebook belongs to no session',
    'notebook has a sessionId, so it belongs to somebody'
  );
  expect(
    notebook.summary === data.notebook.summary,
    'overview summary matches demo.json',
    'overview summary differs from demo.json'
  );

  const questions = (notebook.suggestedQuestions as string[] | null) ?? [];
  expect(
    questions.length === data.notebook.suggestedQuestions.length,
    `${questions.length} suggested questions`,
    `${questions.length} suggested questions, expected ${data.notebook.suggestedQuestions.length}`
  );

  const rows = await prisma.source.findMany({
    where: { notebookId: DEMO_ID },
    orderBy: { position: 'asc' },
  });

  expect(
    rows.length === sources.length,
    `${rows.length} sources`,
    `${rows.length} sources, expected ${sources.length}`
  );

  for (const expected of sources) {
    const row = rows.find((one) => one.id === expected.id);
    if (!row) {
      fail(`${expected.file}: no row with id ${expected.id}`);
      continue;
    }
    if (row.status !== 'ready') fail(`${expected.file}: status ${row.status}`);
    if (row.charCount !== expected.chars) {
      fail(`${expected.file}: ${row.charCount} characters, expected ${expected.chars}`);
      continue;
    }
    if (row.text.length !== expected.chars) {
      fail(`${expected.file}: stored text is ${row.text.length} characters`);
      continue;
    }
    const guide = row.guide as { language?: string } | null;
    if (guide?.language !== expected.language) {
      fail(`${expected.file}: guide language ${String(guide?.language)}, expected ${expected.language}`);
      continue;
    }
    if (row.tokenCount !== expected.tokens) {
      fail(`${expected.file}: ${row.tokenCount} tokens, expected ${expected.tokens}`);
      continue;
    }
    pass(
      `${expected.file}: ${expected.chars.toLocaleString('en-US')} characters, ` +
        `${expected.tokens.toLocaleString('en-US')} tokens, ${expected.language}, id ${row.id}`
    );
  }

  const leftovers = rows.filter((row) => !sources.some((one) => one.id === row.id));
  expect(
    leftovers.length === 0,
    'no sources beyond the seeded four',
    `${leftovers.length} source(s) the seed did not write: ${leftovers.map((one) => one.id).join(', ')}`
  );

  const messages = await prisma.message.count({ where: { notebookId: DEMO_ID } });
  expect(messages === 0, 'no stored turns', `${messages} stored turn(s)`);

  // Reports too, because the seed deletes them. A check that passed while a
  // report somebody requested an hour ago sat in the panel would be a check
  // that disagrees with the reset it is paired with.
  const artifacts = await prisma.artifact.count({ where: { notebookId: DEMO_ID } });
  expect(artifacts === 0, 'no reports', `${artifacts} report(s) a visitor asked for`);

  return { ok, lines };
}
