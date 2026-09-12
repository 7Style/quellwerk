/**
 * The two refusal sentences, character for character.
 *
 * They exist in three places and have to change in all three at once:
 * prompts/notebook-chat-system.md fixes them, the route enforces that a refusal
 * carries no chip (backend/app/modules/chat/internal/refusal.ts), and the
 * interface draws one differently from an answer.
 *
 * Three copies of a string is a smell, and the cure is a field rather than a
 * fourth copy: the route already decides this and could say so on the message.
 * Until it does, this file is the frontend's copy and this comment is the
 * pointer to the others.
 */
export const REFUSALS = [
  'Die Quellen enthalten dazu keine Informationen.',
  'The sources do not cover this.',
];

/**
 * True when an answer opens with one of them.
 *
 * Only the opening, because the prompt requires the sentence to be first. An
 * answer that quotes the sentence in the middle is an answer, and drawing it as
 * a refusal would tell the reader the sources are empty when they are not.
 */
export function beginsWithRefusal(text: string): boolean {
  const start = text.trimStart();
  return REFUSALS.some((sentence) => start.startsWith(sentence));
}

/**
 * The refusal sentence at the start of an answer, or null.
 *
 * The interface sets it apart from the sentences that follow it, and doing that
 * by segment boundary would be wrong: the API returns a refusal as one text
 * block, and where that block happens to end says nothing about where the
 * sentence does.
 */
export function refusalLead(text: string): string | null {
  const start = text.trimStart();
  return REFUSALS.find((sentence) => start.startsWith(sentence)) ?? null;
}
