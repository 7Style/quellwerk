import type { Citation } from '@/lib/citation';

/**
 * Ein Kartenstapel, wie die Route ihn schickt
 * (backend/app/modules/studio/dto/studio.dto.ts).
 *
 * Die Rueckseite ist ein Segmentstrom und kein Text: so behaelt sie ihre
 * geprueften Belege, und derselbe Renderer zeichnet sie wie eine Antwort. Eine
 * Karte, die man umdreht und deren Beleg man nicht oeffnen kann, waere eine
 * Behauptung mit einer Zahl daneben.
 */
export interface Flashcard {
  question: string;
  answer: Array<{ text: string; citations: Citation[] }>;
}

export interface Flashcards {
  id: string;
  notebookId: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
  error: string | null;
  cards: Flashcard[];
  createdAt: string;
  finishedAt: string | null;
}

export function isWritingCards(deck: Flashcards | null): boolean {
  return deck?.status === 'queued' || deck?.status === 'running';
}

export function citationsOnCard(card: Flashcard): Citation[] {
  return card.answer.flatMap((segment) => segment.citations);
}
