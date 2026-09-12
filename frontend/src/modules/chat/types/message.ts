import type { Citation } from '@/lib/citation';

/**
 * A turn as it is stored and streamed.
 *
 * `segments` is the shape the route writes (`AnswerSegment` in
 * backend/app/modules/chat/internal/citations.ts): the Citations API attaches
 * citations to a text block, not to a character range of the answer, so a
 * segment is a run of text and the chips that belong at its end. Joining the
 * segments with nothing gives the answer; putting anything between them tears
 * sentences apart at their chips, which is a bug this repository has already
 * had once.
 */
export interface AnswerSegment {
  text: string;
  citations: Citation[];
}

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  segments: AnswerSegment[];
  /** Citations that failed the server's check and were never rendered. */
  droppedCitations: number;
  /**
   * Whether the answer is the refusal.
   *
   * It comes from the server, on the message and in the `done` event. The two
   * refusal sentences are fixed in the frozen system prompt and the route
   * already owns them, enforces that such an answer carries no chip, and says
   * which it was. A copy here would be the fourth, and the first one to drift.
   */
  refused: boolean;
  /** Set when the turn ended early. */
  stopped?: boolean;
  truncated?: boolean;
  /**
   * Die Id der gespeicherten Antwortzeile, sobald der Server sie nennt.
   *
   * Sie kommt mit `done` und steht an einer Nachricht aus dem Verlauf ohnehin.
   * "Save to note" schickt genau sie: der Server holt die geprueften Segmente
   * aus seiner eigenen Zeile, statt dem Client seine Belege zu glauben.
   *
   * Fehlt im Demo-Notizbuch, wo kein Turn gespeichert wird - dann gibt es
   * nichts zu sichern und der Knopf erscheint nicht.
   */
  savedId?: string | null;
}

export type Message = UserMessage | AssistantMessage;

/**
 * What the chat is doing. Every one of them ends: docs/SPEC.md rules out a
 * spinner that does not stop, so `thinking` and `streaming` are the only two
 * states without a final word in them, and both are left by an event.
 */
export type TurnState = 'idle' | 'thinking' | 'streaming' | 'stopped' | 'error';

export function answerText(message: AssistantMessage): string {
  return message.segments.map((segment) => segment.text).join('');
}

export function citationsOf(message: AssistantMessage): Citation[] {
  return message.segments.flatMap((segment) => segment.citations);
}

/** How many distinct sources an answer draws on. Shown under it. */
export function sourceCountOf(message: AssistantMessage): number {
  return new Set(citationsOf(message).map((citation) => citation.sourceId)).size;
}
