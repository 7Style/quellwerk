/**
 * Does the prompt cache actually get read?
 *
 * Everything about this product's economics rests on one claim: the documents
 * are paid for once an hour, not once a question (ADR-0002). The claim is
 * cheap to make and easy to break - a breakpoint in the wrong place, an effort
 * that changed, a system block that gained a date - and none of those break a
 * test. They just make every turn cost full price, silently, and the only trace
 * is `cache_read_input_tokens` staying at zero.
 *
 * So this asks the real API four times and reads that one number.
 *
 *   1. a turn that writes the cache
 *   2. a second turn: it must read
 *   3. a turn with Configure chat set: it must still read, because style and
 *      length go into the last user turn, behind the breakpoint
 *   4. a report: it must read too, because a report is a chat turn whose last
 *      message is a task instead of a question
 *
 * The fourth is the one worth the money. A report over a full notebook that
 * pays for its own prefix costs about ten times what it should, and nothing in
 * the interface would look different.
 */
import { buildChatRequest } from '../app/adapters/llm/chat-request.js';
import { AnthropicLlmAdapter } from '../app/adapters/llm/anthropic.adapter.js';
import { effortChat, models } from '../app/config/models.js';
import { loadPrompt, renderPrompt } from '../app/services/prompt-loader/index.js';
import { buildReportRequest } from '../app/wiring/studio.js';
import type { CorpusFile } from './corpus.js';

/** What one call reported about the cache. */
export interface CacheProbe {
  label: string;
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  /** False for the first call, which is expected to write rather than read. */
  mustRead: boolean;
}

export interface CacheCheckReport {
  probes: CacheProbe[];
  /** The probes that had to read and did not. Empty is the only good answer. */
  failures: CacheProbe[];
}

const MAX_TOKENS = 1_000;

function usageOf(message: {
  usage: {
    input_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}): Pick<CacheProbe, 'inputTokens' | 'cacheRead' | 'cacheWrite'> {
  return {
    inputTokens: message.usage.input_tokens,
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
  };
}

export async function runCacheCheck(corpus: CorpusFile[]): Promise<CacheCheckReport> {
  const llm = new AnthropicLlmAdapter();
  const system = (await loadPrompt('notebook-chat-system')).body;

  const sources = corpus.map((file, index) => ({
    id: file.file,
    position: index + 1,
    title: file.title,
    kind: file.kind,
    text: file.text,
    pageCount: file.pages.length > 0 ? file.pages.length : null,
  }));

  async function ask(
    label: string,
    question: string,
    preferences: { style?: string; length?: string },
    mustRead: boolean
  ): Promise<CacheProbe> {
    const tail = await renderPrompt('chat-preferences-tail', {
      question,
      style: preferences.style ?? '',
      length: preferences.length ?? '',
      customInstructions: '',
    });

    const { request } = buildChatRequest({
      model: models.chat,
      system,
      sources,
      tail,
      maxTokens: MAX_TOKENS,
      effort: effortChat,
    });

    const message = await llm.streamToMessage(request);
    return { label, mustRead, ...usageOf(message) };
  }

  const probes: CacheProbe[] = [];

  // 1. Writes the prefix. Reading zero here is right, not a failure.
  probes.push(await ask('first turn', 'Ab wann gilt die Verordnung?', {}, false));

  // 2. The same prefix, a different question. The question sits behind the
  //    breakpoint, in the last user turn.
  probes.push(await ask('second turn', 'Was ist ein Risikomanagementsystem?', {}, true));

  // 3. Configure chat. Style and length go into the same last user turn
  //    (prompts/README.md, cache rule 3); if they had gone into the system
  //    block, this is the call that would fall to zero.
  probes.push(
    await ask(
      'after Configure chat',
      'Was verlangt Artikel 10?',
      { style: 'Formal', length: 'Short' },
      true
    )
  );

  // 4. A report. Same documents, same system block, same effort, and only the
  //    last message differs. Anything else here would be a second cache
  //    namespace and every report would pay for the whole notebook again.
  const { request: reportRequest } = await buildReportRequest({
    format: 'briefing',
    focus: '',
    sources,
    language: 'German',
  });
  const report = await llm.streamToMessage({ ...reportRequest, max_tokens: MAX_TOKENS });
  probes.push({ label: 'report right after a chat turn', mustRead: true, ...usageOf(report) });

  return { probes, failures: probes.filter((probe) => probe.mustRead && probe.cacheRead === 0) };
}

export function formatCacheCheck(report: CacheCheckReport): string {
  const lines = [
    '',
    '  call                              input   cache read   cache write',
    '  ---------------------------------------------------------------------',
  ];

  for (const probe of report.probes) {
    lines.push(
      `  ${probe.label.padEnd(30)} ${String(probe.inputTokens).padStart(7)} ` +
        `${String(probe.cacheRead).padStart(12)} ${String(probe.cacheWrite).padStart(13)}` +
        (probe.mustRead ? '' : '   (writes)')
    );
  }

  lines.push('');
  if (report.failures.length === 0) {
    lines.push('  Every call that had to read the cache read it.');
  } else {
    lines.push(`  FAIL: ${report.failures.map((probe) => probe.label).join(', ')} read nothing.`);
    lines.push('  The documents are being paid for on every call (prompts/README.md, rule 2).');
  }

  return lines.join('\n');
}
