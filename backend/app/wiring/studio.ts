/**
 * What a report needs from the rest of the application.
 *
 * Outside `app/modules/` for the same reason `wiring/chat.ts` is: it reaches
 * into the prompt loader, the request builder and the adapter at once, and a
 * file under `app/modules/` is a file some module will eventually import.
 *
 * `buildReportRequest` is exported rather than hidden in the worker because two
 * callers need exactly the same request: the job that writes a report, and the
 * cache assertion in the eval, which has to send what the product sends or it
 * proves nothing (prompts/README.md, cache rule 6).
 */
import type Anthropic from '@anthropic-ai/sdk';

import { buildChatRequest } from '../adapters/llm/index.js';
import { effortChat, models } from '../config/models.js';
import { loadPrompt, renderPrompt } from '../services/prompt-loader/index.js';
import { FORMATS, type ReportFormat, type ReportSource } from '../modules/studio/index.js';

/**
 * Room for a report. Four times a chat answer: a study guide with ten questions
 * and their citations is a long document, and a report that stops in the middle
 * of its last section is worth less than a shorter one that finishes.
 */
export const REPORT_MAX_TOKENS = 16_000;

export interface BuiltReportRequest {
  request: Anthropic.MessageCreateParamsStreaming;
  /** Position in this array is a citation's `document_index`. */
  sourceIds: string[];
  /** The rendered last user turn, stored for "View prompt used". */
  promptUsed: string;
}

/**
 * The request for one report.
 *
 * It is a chat turn whose last user message is the report task instead of a
 * question. That is not a shortcut: the documents, the system block and the
 * effort are identical, so a report asked for right after a chat turn reads the
 * cached prefix instead of paying for 150,000 tokens again. Anything different
 * here - another effort, another builder, a system block of its own - would be
 * a second cache namespace and the report would pay full price every time.
 */
/**
 * Der Aufruf fuer die Karten.
 *
 * Derselbe Bauer wie ein Report, aus demselben Grund und mit derselben Folge:
 * gleiche Dokumente, gleicher Systemblock, gleicher Effort, also liest er den
 * Cache-Praefix des Chats. Die Karten brauchen Belege, und Belege gibt es nur
 * hier -- ein Structured-Output-Aufruf wie bei der Mind Map koennte keine
 * tragen (CLAUDE.md, HTTP 400) und wuerde ausserdem seinen eigenen Praefix
 * bezahlen.
 */
export async function buildFlashcardsRequest(input: {
  sources: ReportSource[];
  language: string;
}): Promise<BuiltReportRequest> {
  const system = (await loadPrompt('notebook-chat-system')).body;
  const tail = await renderPrompt('flashcards', { language: input.language });

  const { request, sourceIds } = buildChatRequest({
    model: models.chat,
    system,
    sources: input.sources.map((source) => ({
      id: source.id,
      position: source.position,
      title: source.title,
      kind: source.kind,
      text: source.text,
      pageCount: source.pageCount,
    })),
    tail,
    maxTokens: REPORT_MAX_TOKENS,
    effort: effortChat,
  });

  return { request, sourceIds, promptUsed: tail };
}

export async function buildReportRequest(input: {
  format: ReportFormat;
  focus: string;
  sources: ReportSource[];
  /** An English language name, from the sources' guides (prompts/README.md). */
  language: string;
}): Promise<BuiltReportRequest> {
  const system = (await loadPrompt('notebook-chat-system')).body;
  const structure = (await loadPrompt(FORMATS[input.format].prompt)).body;

  // The structure renders raw, the focus renders escaped, in one render call.
  // That pairing is the whole reason report-common.md exists as its own file.
  const tail = await renderPrompt('report-common', {
    structure,
    focus: input.focus,
    language: input.language,
  });

  const { request, sourceIds } = buildChatRequest({
    model: models.chat,
    system,
    sources: input.sources.map((source) => ({
      id: source.id,
      position: source.position,
      title: source.title,
      kind: source.kind,
      text: source.text,
      pageCount: source.pageCount,
    })),
    // No history. A report is written from the documents, not from whatever was
    // asked before it; a conversation in front of it would change the report
    // without the reader being able to see why.
    tail,
    maxTokens: REPORT_MAX_TOKENS,
    effort: effortChat,
  });

  return { request, sourceIds, promptUsed: tail };
}
