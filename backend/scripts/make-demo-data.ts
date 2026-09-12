/**
 * Writes `prisma/seed-data/demo.json`: the guides and the overview of the demo
 * notebook.
 *
 * Run by hand, with a key, when the corpus or one of the two prompts changes.
 * Nowhere else: the seed reads the file, and the server reproduces a known
 * state instead of paying for a slightly different one.
 *
 *   pnpm --filter @quellwerk/backend exec tsx scripts/make-demo-data.ts
 *   pnpm --filter @quellwerk/backend exec tsx scripts/make-demo-data.ts --dry-run
 *
 * It calls the same prompts through the same builder as the ingest does, with
 * the same models and the same trimming, so the file holds what an upload of
 * these four documents would have produced. What it does not do is write to the
 * database or to `usage_log`: this is not a visitor's spend, it is mine, and a
 * row here would be demo budget nobody used (the same rule the evals follow,
 * docs/KNOWN-LIMITS.md).
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildArtifactRequest, buildCountTokensRequest } from '../app/adapters/llm/index.js';
import { AnthropicLlmAdapter } from '../app/adapters/llm/anthropic.adapter.js';
import { effortChat, models } from '../app/config/models.js';
import { priceCall } from '../app/config/prices.js';
import { extract } from '../app/modules/sources/internal/extract.js';
import {
  sourceGuideSchema,
  type SourceGuide,
} from '../app/modules/sources/internal/ingest.job.js';
import {
  notebookOverviewSchema,
  SUGGESTED_QUESTION_COUNT,
  type NotebookOverview,
} from '../app/modules/notebooks/internal/overview.job.js';
import { renderPrompt } from '../app/services/prompt-loader/index.js';
import { loadCorpusFiles, type CorpusEntry } from '../prisma/seed-data/corpus.js';
import { demoDataSchema, type DemoData } from '../prisma/seed-data/demo.js';

/** The same ceiling the worker gives a structured-output call. */
const ARTIFACT_MAX_TOKENS = 4_000;

/** The same two numbers the jobs enforce in code, not in a schema. */
const MAX_TOPICS = 8;
const MAX_THEMES = 6;

/** The title and emoji of the demo notebook are chosen, not generated. */
const NOTEBOOK = { title: 'EU-KI-Verordnung', emoji: '⚖️' };

const llm = new AnthropicLlmAdapter();

let spentMicroCents = 0;

async function runArtifact<T>(options: {
  prompt: string;
  schema: Parameters<typeof buildArtifactRequest>[0]['schema'];
  sources: Array<{ id: string; position: number; title: string; kind: string; text: string }>;
  model: string;
  effort?: typeof effortChat;
  values?: Record<string, string>;
}): Promise<T> {
  const instructions = await renderPrompt(options.prompt, options.values ?? {});

  const request = buildArtifactRequest({
    model: options.model,
    instructions,
    sources: options.sources,
    schema: options.schema,
    maxTokens: ARTIFACT_MAX_TOKENS,
    ...(options.effort ? { effort: options.effort } : {}),
  });

  const { parsed, usage } = await llm.parseArtifact<T>(request);

  spentMicroCents += priceCall(options.model, usage);

  return parsed;
}

async function guideFor(entry: CorpusEntry, text: string): Promise<SourceGuide> {
  const guide = await runArtifact<SourceGuide>({
    prompt: 'source-guide',
    schema: sourceGuideSchema,
    sources: [{ id: 'source', position: 1, title: entry.title, kind: entry.kind, text }],
    // MODEL_FAST, and without an effort: Haiku 4.5 rejects the parameter
    // (CLAUDE.md). The same call the ingest makes.
    model: models.fast,
  });

  return { ...guide, topics: guide.topics.slice(0, MAX_TOPICS) };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const corpus = await loadCorpusFiles();
  console.log(`corpus: ${corpus.length} files`);

  const extracted: Array<{ entry: CorpusEntry; text: string }> = [];
  for (const entry of corpus) {
    const { text } = await extract(entry.kind, entry.data);
    extracted.push({ entry, text });
    console.log(`  ${entry.file}: ${text.length.toLocaleString('en-US')} characters`);
  }

  if (dryRun) {
    console.log('--dry-run: no model was called, nothing was written.');
    return;
  }

  const sources: DemoData['sources'] = [];
  for (const [index, one] of extracted.entries()) {
    const guide = await guideFor(one.entry, one.text);

    // One request per source and not one for the notebook, the same way
    // `recount-tokens.ts` does it: the capacity gate maintains the cap as a sum
    // of per-source counts, so the parts have to be measured as parts. The
    // endpoint is free and rate limited separately from message creation.
    const tokens = await llm.countTokens(
      buildCountTokensRequest({
        model: models.chat,
        sources: [
          {
            id: 'source',
            position: index + 1,
            title: one.entry.title,
            kind: one.entry.kind,
            text: one.text,
          },
        ],
      })
    );

    sources.push({ file: one.entry.file, guide, tokens });
    console.log(
      `guide ${index + 1}/${extracted.length}: ${one.entry.file} -> ${guide.language}, ` +
        `${guide.topics.length} topics, ${tokens.toLocaleString('en-US')} tokens` +
        `${guide.hasInstructions ? ', contains instructions' : ''}`
    );
  }

  // The language of the notebook is the majority language of its guides, which
  // is what `languageOf` in the worker computes from the same field. Passing it
  // is the whole point of writing the guides first.
  const language = majorityLanguage(sources.map((one) => one.guide.language));
  console.log(`overview language: ${language}`);

  const overview = await runArtifact<NotebookOverview>({
    prompt: 'notebook-overview',
    schema: notebookOverviewSchema,
    sources: extracted.map((one, index) => ({
      id: `source-${index + 1}`,
      position: index + 1,
      title: one.entry.title,
      kind: one.entry.kind,
      text: one.text,
    })),
    model: models.chat,
    effort: effortChat,
    values: { language },
  });

  const data: DemoData = {
    generatedAt: new Date().toISOString().slice(0, 10),
    models: { guide: models.fast, overview: models.chat },
    tokenModel: models.chat,
    costMicroCents: spentMicroCents,
    notebook: {
      ...NOTEBOOK,
      summary: overview.summary,
      themes: overview.themes.slice(0, MAX_THEMES),
      suggestedQuestions: overview.suggestedQuestions.slice(0, SUGGESTED_QUESTION_COUNT),
    },
    sources,
  };

  // Parsed before it is written: the seed reads this file through the same
  // schema, and a file that only fails there fails on the server.
  const target = path.join(import.meta.dirname, '..', 'prisma', 'seed-data', 'demo.json');
  await writeFile(target, `${JSON.stringify(demoDataSchema.parse(data), null, 2)}\n`, 'utf8');

  console.log(`\nwritten: ${target}`);
  console.log(`cost: ${(spentMicroCents / 1_000_000).toFixed(2)} cents`);
  console.log(`questions: ${data.notebook.suggestedQuestions.length}`);
}

function majorityLanguage(languages: string[]): string {
  const counts = new Map<string, number>();
  for (const language of languages) {
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  let best = 'English';
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) {
      best = language;
      bestCount = count;
    }
  }
  return best;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
