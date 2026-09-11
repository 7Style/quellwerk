/**
 * Worker process. Everything that takes longer than a chat turn runs here
 * (ADR-0009): ingest, artifact, audio, maintenance.
 *
 * This file is the composition root of the second process, the way
 * modules/index.ts is for the API. The processors themselves are plain
 * functions in their modules and know nothing about BullMQ, Prisma or the SDK;
 * everything is wired here, which is what lets them be tested without any of
 * the three.
 *
 * Every job is idempotent over (notebook, type, params), writes `step` and
 * `heartbeatAt` on the row it works on, and always ends in a terminal status.
 * Stalled work is found through the (status, heartbeatAt) index rather than a
 * job table. Artifact processors arrive in M6-T1, audio in M10, maintenance in
 * M7-T5.
 */
import { readFile } from 'node:fs/promises';

import {
  AnthropicLlmAdapter,
  buildArtifactRequest,
  buildCountTokensRequest,
  type DocumentSource,
} from './adapters/llm/index.js';
import { logger } from './common/utils/logger.util.js';
import { env } from './config/env.config.js';
import { effortChat, models } from './config/models.js';
import { prisma, type Prisma } from './lib/prisma.js';
import {
  notebookOverviewSchema,
  runOverviewJob,
  type NotebookOverview,
  type OverviewSource,
} from './modules/notebooks/internal/overview.job.js';
import {
  notebookTitleSchema,
  runIngestJob,
  sourceGuideSchema,
  type IngestDeps,
  type IngestSourceRow,
  type NotebookTitle,
  type SourceGuide,
} from './modules/sources/internal/ingest.job.js';
import { renderPrompt } from './services/prompt-loader/index.js';
import {
  closeQueues,
  createConnection,
  createWorker,
  dedupeKey,
  enqueueDebounced,
  type QueuedJob,
} from './services/queue/index.js';
import { recordUsage } from './services/usage-log/index.js';

const llm = new AnthropicLlmAdapter();

/**
 * Its own Redis connection, for one job: deciding which of two ingest jobs
 * running at the same time writes the notebook title.
 */
const titleLock = createConnection();

/**
 * Enough for a guide, a title or an overview. All three are short objects; the
 * cap exists so a runaway generation ends rather than bills.
 */
const ARTIFACT_MAX_TOKENS = 2_000;

/** Long enough that three uploads in a row collapse into one overview run. */
const OVERVIEW_DEBOUNCE_MS = 20_000;

/**
 * Runs one structured-output prompt and books what it cost.
 *
 * Every model call in this process goes through here, so there is exactly one
 * place where a call can happen without a `usage_log` row behind it: none.
 */
async function runArtifact<T>(options: {
  prompt: string;
  schema: Parameters<typeof buildArtifactRequest>[0]['schema'];
  sources: DocumentSource[];
  model: string;
  effort?: typeof effortChat;
  values?: Record<string, string>;
  route: string;
  notebookId: string;
  cache5m?: boolean;
}): Promise<T> {
  const instructions = await renderPrompt(options.prompt, options.values ?? {});

  const request = buildArtifactRequest({
    model: options.model,
    instructions,
    sources: options.sources,
    schema: options.schema,
    maxTokens: ARTIFACT_MAX_TOKENS,
    ...(options.effort ? { effort: options.effort } : {}),
    ...(options.cache5m ? { cache5m: true } : {}),
  });

  const { parsed, usage } = await llm.parseArtifact<T>(request);

  await recordUsage({
    ...usage,
    route: options.route,
    model: options.model,
    effort: options.effort ?? null,
    notebookId: options.notebookId,
  });

  return parsed;
}

/** One source as a document block. The job hands over text it already holds. */
function asDocument(source: { title: string; text: string; kind: string }): DocumentSource {
  return { id: 'source', position: 1, title: source.title, kind: source.kind, text: source.text };
}

/**
 * The language the model should write in, taken from the source guides that
 * exist. An English language name, never a BCP-47 code: "Write in de." is not a
 * sentence (prompts/README.md).
 */
function languageOf(guides: unknown[]): string {
  const counts = new Map<string, number>();
  for (const guide of guides) {
    const language = (guide as SourceGuide | null)?.language;
    if (typeof language === 'string' && language.length > 0) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
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

/**
 * @param notebookId needed for the usage rows. `usage_log.notebook_id` is a
 * foreign key, so an empty string is not "unknown", it is a constraint
 * violation that recordUsage would swallow and nobody would see the spend.
 */
function ingestDeps(notebookId: string): IngestDeps {
  return {
    getSource: async (sourceId) => {
      const row = await prisma.source.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          notebookId: true,
          position: true,
          title: true,
          kind: true,
          status: true,
          text: true,
          tokenCount: true,
          storagePath: true,
        },
      });
      return row as IngestSourceRow | null;
    },

    updateSource: async (sourceId, update) => {
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          ...(update.status !== undefined ? { status: update.status } : {}),
          ...(update.step !== undefined ? { step: update.step } : {}),
          ...(update.error !== undefined ? { error: update.error } : {}),
          ...(update.text !== undefined ? { text: update.text } : {}),
          ...(update.charCount !== undefined ? { charCount: update.charCount } : {}),
          ...(update.tokenCount !== undefined ? { tokenCount: update.tokenCount } : {}),
          // Prisma types a Json column as InputJsonValue, which an array of a
          // named interface does not satisfy structurally even though it is
          // valid JSON. The cast is at the boundary to the database and
          // nowhere else.
          ...(update.pages !== undefined
            ? { pages: update.pages as unknown as Prisma.InputJsonValue }
            : {}),
          ...(update.guide !== undefined
            ? { guide: update.guide as Prisma.InputJsonValue }
            : {}),
        },
      });
    },

    // Written before the step, not after: the point is to show that something
    // is happening now, not that something finished.
    heartbeat: async (sourceId, step) => {
      await prisma.source.update({
        where: { id: sourceId },
        data: { step, heartbeatAt: new Date(), status: 'processing' },
      });
    },

    readFile: (storagePath) => readFile(storagePath),

    countTextTokens: (title, text) =>
      llm.countTokens(
        buildCountTokensRequest({
          model: models.chat,
          sources: [{ id: 'pending', position: 1, title, kind: 'paste', text }],
        })
      ),

    addNotebookTokens: async (notebookId, tokens) => {
      await prisma.notebook.update({
        where: { id: notebookId },
        data: { tokenCount: { increment: tokens } },
      });
    },

    // An atomic claim, not a count. SET NX is a single round trip that either
    // sets the key or does not, so exactly one of two jobs running side by side
    // gets true. The hour is a safety net: if a job dies between the claim and
    // the write, the next source to finish claims again rather than leaving the
    // notebook untitled for good.
    claimTitle: async (notebookId) =>
      (await titleLock.set(`qw:title:${notebookId}`, '1', 'EX', 3_600, 'NX')) === 'OK',

    notebookTokens: async (notebookId) => {
      const notebook = await prisma.notebook.findUnique({
        where: { id: notebookId },
        select: { tokenCount: true },
      });
      return notebook?.tokenCount ?? 0;
    },

    writeGuide: (source) =>
      runArtifact<SourceGuide>({
        prompt: 'source-guide',
        schema: sourceGuideSchema,
        sources: [asDocument(source)],
        // The fast model, and therefore no effort and no thinking: it rejects
        // both (ADR-0011).
        model: models.fast,
        route: 'ingest.source-guide',
        notebookId,
        // No cache breakpoint, and this was measured rather than reasoned:
        // with one set, the title call that follows seconds later wrote a
        // second 35,000 token cache instead of reading the first
        // (cacheRead 0, write5m 35,430). prompts/README.md rule 4 says why:
        // output_config.format injects the schema as an extra system prompt,
        // which sits in front of the documents, so two artifacts with
        // different schemas never share a prefix. A breakpoint here would only
        // pay 1.25x for a cache nobody can read.
      }),

    writeNotebookTitle: (source, language) =>
      runArtifact<NotebookTitle>({
        prompt: 'notebook-title',
        schema: notebookTitleSchema,
        sources: [asDocument(source)],
        model: models.fast,
        values: { language },
        route: 'ingest.notebook-title',
        notebookId,
        // No breakpoint here either, for the same measured reason.
      }),

    setNotebookTitle: async (notebookId, title) => {
      // Never over a title the user set themselves.
      await prisma.notebook.updateMany({
        where: { id: notebookId, userSetTitle: false },
        data: { title: title.title, emoji: title.emoji },
      });
    },

    requestOverview: async (notebookId) => {
      await enqueueDebounced(
        'ingest',
        dedupeKey(notebookId, 'overview', 'all'),
        { kind: 'overview', notebookId } satisfies QueuedJob,
        OVERVIEW_DEBOUNCE_MS
      );
    },

    maxTokensPerNotebook: env.MAX_TOKENS_PER_NOTEBOOK,
  };
}

function overviewDeps(notebookId: string) {
  return {
    readySources: async (id: string): Promise<OverviewSource[]> =>
      prisma.source.findMany({
        where: { notebookId: id, status: 'ready' },
        orderBy: { position: 'asc' },
        select: { id: true, position: true, title: true, kind: true, text: true },
      }),

    writeOverview: async (sources: OverviewSource[]): Promise<NotebookOverview> => {
      const guides = await prisma.source.findMany({
        where: { notebookId, status: 'ready' },
        select: { guide: true },
      });

      return runArtifact<NotebookOverview>({
        prompt: 'notebook-overview',
        schema: notebookOverviewSchema,
        sources,
        model: models.chat,
        effort: effortChat,
        values: { language: languageOf(guides.map((row) => row.guide)) },
        route: 'ingest.notebook-overview',
        notebookId,
      });
    },

    saveOverview: async (id: string, overview: NotebookOverview): Promise<void> => {
      await prisma.notebook.update({
        where: { id },
        data: {
          summary: overview.summary,
          themes: overview.themes,
          suggestedQuestions: overview.suggestedQuestions,
          overviewRequestedAt: new Date(),
        },
      });
    },
  };
}

async function main(): Promise<void> {
  logger.info('[Worker] starting', { queues: ['ingest'] });

  const ingest = createWorker<QueuedJob>('ingest', async (job) => {
    const data = job.data;

    if (data.kind === 'overview') {
      const result = await runOverviewJob(overviewDeps(data.notebookId), data);
      logger.info('[Worker] overview', { notebookId: data.notebookId, ...result });
      return;
    }

    const result = await runIngestJob(ingestDeps(data.notebookId), data);
    logger.info('[Worker] ingest', { sourceId: data.sourceId, ...result });
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info('[Worker] shutting down', { signal });
    void (async () => {
      await ingest.close();
      await titleLock.quit();
      await closeQueues();
      await prisma.$disconnect();
      process.exit(0);
    })();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

await main();
