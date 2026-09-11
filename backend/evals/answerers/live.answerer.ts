/**
 * Answers a golden item the way the product does.
 *
 * It goes through `buildChatRequest` and the real system prompt, not through a
 * copy of them. A harness that built its own request would measure a request
 * nobody ships; every number here has to be a number about the thing that runs.
 *
 * What it does NOT go through is the HTTP route. The route adds a session, a
 * notebook, rate limits and a database, and none of those change an answer.
 * Running the eval against them would make every number depend on a stack being
 * up, and a red run would say "the database was down" as often as "the prompt
 * got worse".
 *
 * The corpus is the notebook: the same four files the golden set quotes, in
 * manifest order, so `document_index` resolves to a file name and a citation can
 * be checked against the text on disk.
 */
import { buildChatRequest } from '../../app/adapters/llm/chat-request.js';
import { AnthropicLlmAdapter } from '../../app/adapters/llm/anthropic.adapter.js';
import { answerText } from '../../app/modules/chat/index.js';
import { effortChat, models } from '../../app/config/models.js';
import { loadPrompt, renderPrompt } from '../../app/services/prompt-loader/index.js';
import type { CorpusFile } from '../corpus.js';
import type { GoldenItem } from '../golden.js';
import type { Answerer, EvalAnswer, EvalCitation } from './types.js';

/** The same cap the route uses, so the answers are the same shape. */
const MAX_TOKENS = 4_000;

export class LiveAnswerer implements Answerer {
  readonly name = `live (${models.chat}, effort ${effortChat})`;
  readonly callsModel = true;

  private system: string | null = null;

  constructor(
    private readonly corpus: CorpusFile[],
    private readonly llm: AnthropicLlmAdapter = new AnthropicLlmAdapter()
  ) {}

  async answer(item: GoldenItem): Promise<EvalAnswer> {
    this.system ??= (await loadPrompt('notebook-chat-system')).body;

    const tail = await renderPrompt('chat-preferences-tail', {
      question: item.question,
      style: '',
      length: '',
      customInstructions: '',
    });

    const { request, sourceIds } = buildChatRequest({
      model: models.chat,
      system: this.system,
      sources: this.corpus.map((file, index) => ({
        id: file.file,
        position: index + 1,
        title: file.title,
        kind: file.kind,
        text: file.text,
        pageCount: file.pages.length > 0 ? file.pages.length : null,
      })),
      // No history. Every golden item is a first turn; carrying a conversation
      // between them would make an item's score depend on the one before it.
      tail,
      maxTokens: MAX_TOKENS,
      effort: effortChat,
    });

    const started = Date.now();
    const message = await this.llm.streamToMessage(request);
    const latencyMs = Date.now() - started;

    // The same join the route uses, for the same reason: a judge that reads an
    // answer torn apart at every chip grades a text nobody would ship.
    const text = answerText(message.content.filter((block) => block.type === 'text'));

    const citations: EvalCitation[] = [];
    for (const block of message.content) {
      if (block.type !== 'text') continue;
      for (const citation of block.citations ?? []) {
        // Only character locations. The runner checks a citation by slicing the
        // stored text, which a page location cannot be checked against; the
        // route drops those too (ADR-0010).
        if (citation.type !== 'char_location') continue;

        const file = sourceIds[citation.document_index];
        if (!file) continue;

        citations.push({
          file,
          start: citation.start_char_index,
          end: citation.end_char_index,
          citedText: citation.cited_text,
        });
      }
    }

    return {
      text,
      citations,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      latencyMs,
    };
  }
}
