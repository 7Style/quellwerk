/**
 * What the chat module needs from the rest of the application.
 *
 * It lives outside `app/modules/` on purpose. Everything here reaches into
 * Prisma, the adapter and two other modules' tables at once, and a file under
 * `app/modules/` is a file that some module will eventually import, which is
 * exactly what the boundary rule forbids. The composition root may know about
 * everything; a module may not.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from 'express';

import {
  AnthropicLlmAdapter,
  buildChatRequest,
  byDocumentOrder,
  usageFrom,
} from '../adapters/llm/index.js';
import { buildArtifactRequest } from '../adapters/llm/artifact-request.js';
import { effortChat, models } from '../config/models.js';
import { logger } from '../common/utils/logger.util.js';
import { prisma, type Prisma } from '../lib/prisma.js';
import {
  answerText,
  type ChatServiceDeps,
  type StreamEvent,
  type TurnSources,
} from '../modules/chat/index.js';
import { pageAt, type PageSpan } from '../modules/sources/internal/pages.js';
import { loadPrompt, renderPrompt } from '../services/prompt-loader/index.js';
import { assertBudgetLeft } from '../services/quota/index.js';
import { recordUsage } from '../services/usage-log/index.js';
import { z } from 'zod';

/** Room for an answer with citations. Short answers cost only what they use. */
const CHAT_MAX_TOKENS = 4_000;
const FOLLOW_UP_MAX_TOKENS = 400;

/** A question is one sentence. Anything longer was not written to be clicked. */
const MAX_FOLLOW_UP_CHARS = 200;

/**
 * The history a turn replays: the last twenty turns (docs/SPEC.md). The token
 * cap on top of it arrives with the trim in M5; twenty turns of a notebook this
 * size is already well inside it.
 */
const HISTORY_TURNS = 20;

const followUpSchema = z.object({ questions: z.array(z.string()) });

/** Refuses with 503 once today's spend reached the cap, before the model is called. */
export function budgetMiddleware(): RequestHandler {
  return (_req, _res, next) => {
    assertBudgetLeft().then(
      () => next(),
      (error: unknown) => next(error)
    );
  };
}

/** The notebook fields the access decision needs, and nothing else. */
export interface NotebookAccess {
  /** Nullable in the schema. A notebook without a session belongs to nobody. */
  sessionId: string | null;
  isDemo: boolean;
}

/**
 * May this session chat in this notebook, and is the notebook shared.
 *
 * Pure, and exported, because it is the only authorisation the chat route has
 * and a rule nobody can test is a rule that quietly stops holding. The two
 * answers are separate on purpose: the demo notebook says yes to everyone, and
 * saying yes to reading it is not the same as saying yes to writing in it
 * (SECURITY.md 7.2, and `NotebookService.writable` enforces the same split).
 */
export function chatAccess(
  notebook: NotebookAccess | null,
  sessionId: string
): { allowed: false } | { allowed: true; shared: boolean } {
  if (!notebook) return { allowed: false };
  if (notebook.isDemo) return { allowed: true, shared: true };
  if (notebook.sessionId !== sessionId) return { allowed: false };
  return { allowed: true, shared: false };
}

export function chatDeps(llm: AnthropicLlmAdapter): ChatServiceDeps {
  return {
    loadSources: async (notebookId, sessionId): Promise<TurnSources> => {
      // Ownership first. A notebook of another session does not exist, and the
      // demo notebook is readable by everyone (SECURITY.md 7.2).
      const notebook = await prisma.notebook.findUnique({
        where: { id: notebookId },
        select: { id: true, sessionId: true, isDemo: true },
      });

      const access = chatAccess(notebook, sessionId);
      if (!access.allowed) {
        throw Object.assign(new Error('No such notebook.'), {
          statusCode: 404,
          errorCode: 'NOTEBOOK_NOT_FOUND',
        });
      }

      // Ready only, in position order. A source still being ingested has no
      // text, and every ready one goes: there is no selection
      // (docs/KNOWN-LIMITS.md).
      const unordered = await prisma.source.findMany({
        where: { notebookId, status: 'ready' },
        select: { id: true, title: true, text: true, kind: true, position: true, pages: true },
      });

      // Sorted here with the builder's own comparator, not with `orderBy`. The
      // index in this array is what a citation's `document_index` resolves
      // against, so it has to be the order the document blocks go out in, tie
      // for tie (`byDocumentOrder`).
      const rows = [...unordered].sort(byDocumentOrder);

      const pages = new Map<string, PageSpan[]>(
        rows.map((row) => [row.id, (row.pages as PageSpan[] | null) ?? []])
      );

      return {
        sources: rows.map((row) => ({ id: row.id, title: row.title, text: row.text })),
        sourceIds: rows.map((row) => row.id),
        pageAt: (sourceId, offset) => pageAt(pages.get(sourceId) ?? [], offset),
        shared: access.shared,
      };
    },

    stream: (input, sources, signal): AsyncIterable<StreamEvent> => {
      return streamTurn(llm, input, sources, signal);
    },

    followUps: async ({ question, answer, sources }, signal) => {
      // Through the renderer, not concatenated here. The question is typed by a
      // reader and the answer comes from a model, so both need the angle bracket
      // replacement every other untrusted value gets, and a prompt assembled in
      // TypeScript is a prompt nobody reviews (prompts/README.md).
      const instructions = await renderPrompt('follow-up-questions', {
        language: 'German',
        question,
        answer,
      });

      const request = buildArtifactRequest({
        model: models.fast,
        instructions,
        sources: sources.map((source, index) => ({
          id: source.id,
          position: index + 1,
          title: source.title,
          kind: 'md',
          text: source.text,
        })),
        schema: followUpSchema,
        maxTokens: FOLLOW_UP_MAX_TOKENS,
        // The same documents the answer was just built from, seconds earlier and
        // on a different model, so this prefix is written once and read by every
        // follow-up call in the next five minutes.
        cache5m: true,
      });

      const { parsed, usage } = await llm.parseArtifact<z.infer<typeof followUpSchema>>(
        request,
        signal
      );

      // The second usage row of the turn (docs/ARCHITECTURE.md): one for the
      // chat on MODEL_CHAT, one for the follow-ups on MODEL_FAST.
      await recordUsage({ ...usage, route: 'chat.follow-ups', model: models.fast });

      // Three, and each of them short. Both are prose in the schema rather than
      // constraints (prompts/README.md), so both are enforced here; the length
      // matters because these strings are rendered as buttons and a model that
      // has been talked into writing a paragraph must not fill the screen with
      // it.
      return parsed.questions
        .map((one) => one.trim())
        .filter((one) => one.length > 0 && one.length <= MAX_FOLLOW_UP_CHARS)
        .slice(0, 3);
    },

    recordUsage: async (message, latencyMs, notebookId) => {
      const usage = usageFrom(message.usage, {
        stopReason: message.stop_reason,
        // The SDK hangs the request id on the message as a non-enumerable
        // property; it is not in the public type, and a cast at the boundary is
        // honester than pretending the type has it.
        requestId: (message as { _request_id?: string })._request_id ?? null,
        latencyMs,
      });

      const costMicroCents = await recordUsage({
        ...usage,
        route: 'chat',
        model: models.chat,
        effort: effortChat,
        notebookId,
      });

      return {
        model: models.chat,
        effort: effortChat,
        latencyMs,
        costMicroCents,
        droppedCitations: 0,
        stopReason: message.stop_reason,
      };
    },

    saveTurn: async (notebookId, turn) => {
      // Two rows, one transaction: a question without its answer reads like the
      // model never replied, and an answer without its question is unreadable.
      await prisma.$transaction([
        prisma.message.create({
          data: { notebookId, role: 'user', segments: [{ text: turn.question }] as Prisma.InputJsonValue },
        }),
        prisma.message.create({
          data: {
            notebookId,
            role: 'assistant',
            // The verified segments, which is what the viewer renders. The raw
            // answer is not stored a second time.
            segments: turn.segments as unknown as Prisma.InputJsonValue,
            usage: { ...turn.usage, ...turn.trace },
            droppedCitations: turn.droppedCitations,
          },
        }),
        prisma.notebook.update({ where: { id: notebookId }, data: { lastUsedAt: new Date() } }),
      ]);
    },

    onError: (error, context) => {
      logger.error('[Chat] turn failed', error, context);
    },

    onDroppedCitations: (dropped, context) => {
      // Offsets and lengths, never the cited text and never the slice
      // (CLAUDE.md, ADR-0003). `warn` and not `error`: the turn was answered and
      // the reader saw a correct answer with one chip fewer.
      logger.warn('[Chat] citations dropped', {
        ...context,
        count: dropped.length,
        dropped,
      });
    },
  };
}

/**
 * Builds the request and streams it.
 *
 * Separate from `chatDeps` only because it is the one part with a loop in it;
 * everything else there is a lookup.
 */
async function* streamTurn(
  llm: AnthropicLlmAdapter,
  input: { notebookId: string; question: string; style?: string; length?: string; customInstructions?: string },
  sources: TurnSources,
  signal: AbortSignal
): AsyncIterable<StreamEvent> {
  const { body } = await loadPrompt('notebook-chat-system');

  const tail = await renderPrompt('chat-preferences-tail', {
    question: input.question,
    style: input.style ?? '',
    length: input.length ?? '',
    customInstructions: input.customInstructions ?? '',
  });

  // Nothing replayed in a shared notebook: its messages were written by other
  // visitors, and one visitor's question is not context for the next one.
  const history = sources.shared ? [] : await loadHistory(input.notebookId);

  const { request } = buildChatRequest({
    model: models.chat,
    system: body,
    sources: sources.sources.map((source, index) => ({
      id: source.id,
      position: index + 1,
      title: source.title,
      kind: 'md',
      text: source.text,
    })),
    history,
    tail,
    maxTokens: CHAT_MAX_TOKENS,
    effort: effortChat,
    // The five minute breakpoint on the history, once there is one worth
    // caching. On the first turn there is nothing behind the documents.
    cacheHistory: history.length > 0,
  });

  yield* llm.streamChat(request, signal);
}

/**
 * Every stored turn of a notebook, oldest first, for the history route.
 *
 * The same access decision as a turn (`chatAccess`), and the same answer when
 * it says no: a notebook of another session does not exist. A shared notebook
 * has no stored turns at all, so this returns nothing there rather than one
 * visitor's conversation to the next.
 */
export async function loadMessages(notebookId: string, sessionId: string) {
  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    select: { id: true, sessionId: true, isDemo: true },
  });

  const access = chatAccess(notebook, sessionId);
  if (!access.allowed) {
    throw Object.assign(new Error('No such notebook.'), {
      statusCode: 404,
      errorCode: 'NOTEBOOK_NOT_FOUND',
    });
  }
  if (access.shared) return [];

  return prisma.message.findMany({
    where: { notebookId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, segments: true, droppedCitations: true, createdAt: true },
  });
}

/** The last turns of this notebook, oldest first, as the builder wants them. */
async function loadHistory(
  notebookId: string
): Promise<Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlockParam[] }>> {
  const rows = await prisma.message.findMany({
    where: { notebookId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS * 2,
    select: { role: true, segments: true },
  });

  return rows
    .reverse()
    .map((row) => ({
      role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      // Stored as verified segments; replayed as plain text. The citations are
      // not replayed: their document indexes belong to the source set of the
      // turn they came from, and a source added since would shift them.
      content: answerText((row.segments as Array<{ text: string }> | null) ?? []),
    }))
    .filter((turn) => turn.content.length > 0);
}
