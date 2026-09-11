/**
 * Asks the live API real questions and checks every citation it returns against
 * the stored text.
 *
 *   pnpm --filter @quellwerk/backend exec tsx scripts/offset-probe.ts
 *
 * The unit tests in citations.test.ts prove that the check works: a shifted
 * offset is caught, a wrong index is caught. What they cannot prove is that the
 * offsets the API actually sends line up with what we stored - that depends on
 * the document block carrying the same string the viewer renders, which depends
 * on normalising exactly once at ingest and never again (ADR-0003).
 *
 * That is a claim about two systems agreeing, and the only honest way to check
 * it is to ask one of them. This script is that question, and it is repeatable:
 * whenever normalise, extract or the request builder changes, run it again.
 *
 * Costs a few cents. It reads the eval corpus, not the database, so it needs no
 * running stack.
 */
import Anthropic from '@anthropic-ai/sdk';

import { buildChatRequest } from '../app/adapters/llm/chat-request.js';
import { resolveAnswer } from '../app/modules/chat/internal/citations.js';
import { pageAt, type PageSpan } from '../app/modules/sources/internal/pages.js';
import { effortChat, models } from '../app/config/models.js';
import { env } from '../app/config/env.config.js';
import { priceCall } from '../app/config/prices.js';
import { loadPrompt, renderPrompt } from '../app/services/prompt-loader/index.js';
import { loadCorpus } from '../evals/corpus.js';

/**
 * Questions that force citations out of different documents and different
 * shapes of text: a single sentence, a list, a definition, a passage that two
 * documents disagree about.
 */
const QUESTIONS = [
  'Ab wann gilt die KI-Verordnung allgemein?',
  'Welche Praktiken verbietet Artikel 5?',
  'Was ist ein Betreiber im Sinne der Verordnung?',
  'Ab wann gelten die Pflichten fuer Hochrisiko-Systeme?',
  'Was sagt die interne Notiz ueber das Bewerber-Screening?',
];

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 4 });

async function main(): Promise<void> {
  const corpus = await loadCorpus();
  const { body: system } = await loadPrompt('notebook-chat-system');

  const sources = corpus.map((file, index) => ({
    id: file.file,
    position: index + 1,
    title: file.title,
    kind: file.kind,
    text: file.text,
    pageCount: file.pages.length > 0 ? file.pages.length : null,
  }));

  const stored = new Map(sources.map((source) => [source.id, source]));
  const pages = new Map<string, PageSpan[]>(corpus.map((file) => [file.file, file.pages]));

  let checked = 0;
  let matched = 0;
  let cost = 0;
  const failures: string[] = [];

  console.log(`offset probe on ${models.chat}, ${sources.length} sources\n`);

  for (const question of QUESTIONS) {
    const tail = await renderPrompt('chat-preferences-tail', { question });
    const { request, sourceIds } = buildChatRequest({
      model: models.chat,
      system,
      sources,
      tail,
      maxTokens: 1_200,
      effort: effortChat,
    });

    const message = await client.messages.stream(request).finalMessage();

    const answer = resolveAnswer(message.content, {
      sourceIds,
      sources: stored,
      pageAt: (sourceId, offset) => pageAt(pages.get(sourceId) ?? [], offset),
    });

    const kept = answer.segments.flatMap((segment) => segment.citations);
    const dropped = answer.droppedCitations;

    checked += kept.length + dropped.length;
    matched += kept.length;
    cost += priceCall(models.chat, {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite5m: message.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
      cacheWrite1h: message.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    });

    const pagesSeen = kept.filter((citation) => citation.page !== null).length;
    console.log(
      `  ${kept.length + dropped.length === 0 ? '  -' : `${kept.length}/${kept.length + dropped.length}`}` +
        `  ${pagesSeen} with a page   ${question}`
    );

    for (const drop of dropped) {
      failures.push(
        `${question} -> ${drop.reason} in ${drop.sourceId ?? 'unknown'} ` +
          `[${drop.start ?? '?'},${drop.end ?? '?'}) cited ${drop.citedLength ?? '?'} chars, ` +
          `slice ${drop.sliceLength ?? '?'} chars`
      );
    }
  }

  console.log(`\n${matched} of ${checked} citations matched`);
  console.log(`cost: ${(cost / 100_000_000).toFixed(4)} USD`);

  if (failures.length > 0) {
    console.error('\nfailures:');
    // Reasons, offsets and lengths. Never the cited text, never the slice.
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }

  if (checked === 0) {
    // Not a pass. A run with nothing to check proves nothing, and reporting
    // "0 of 0 matched" as green is how a probe stops being a probe.
    console.error('\nno citations came back at all; the probe checked nothing');
    process.exitCode = 1;
  }
}

await main();
