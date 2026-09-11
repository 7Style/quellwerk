/**
 * The two refusal sentences, character for character, as the frozen system
 * prompt fixes them (prompts/notebook-chat-system.md, docs/SPEC.md).
 *
 * They live here rather than in the eval harness because the route needs them
 * too: SPEC says a refusal carries no chip, and until now the only thing
 * enforcing that was the prompt asking nicely. A model that ignores the rule
 * once would put a chip under "the sources do not cover this", which invites the
 * reader to click and check a claim nobody made.
 *
 * The comparison is exact on purpose. A refusal a regular expression has to be
 * lenient about is a refusal the reader cannot recognise either, and adding a
 * language means adding its sentence here, never loosening the comparison
 * (prompts/README.md).
 */
export const REFUSALS: Record<string, string> = {
  de: 'Die Quellen enthalten dazu keine Informationen.',
  en: 'The sources do not cover this.',
};

/**
 * True when an answer opens with one of them.
 *
 * Only the opening, because the prompt requires the sentence to be the first
 * one. A text that mentions it in the middle is an answer that happens to quote
 * the refusal, and stripping its citations would be the wrong call.
 */
export function beginsWithRefusal(text: string): boolean {
  const start = text.trimStart();
  return Object.values(REFUSALS).some((sentence) => start.startsWith(sentence));
}
