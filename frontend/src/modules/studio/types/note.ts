import type { Citation } from '@/lib/citation';

/**
 * Eine Notiz, wie die Route sie schickt
 * (backend/app/modules/notes/dto/note.dto.ts).
 *
 * Zwei Sorten in einer Form: eine gesicherte Antwort trägt `segments` mit ihren
 * geprüften Belegen, eine selbst geschriebene trägt nur `markdown`. Die Ansicht
 * entscheidet daran, ob sie Chips zeichnet - und zeichnet nie welche, die nicht
 * vom Server kommen.
 */
export interface Note {
  id: string;
  /** Nicht immer das Notizbuch, an das die Anfrage ging (Copy-on-first-write). */
  notebookId: string;
  title: string;
  markdown: string;
  segments: Array<{ text: string; citations: Citation[] }> | null;
  fromMessageId: string | null;
  createdAt: string;
}

/** Ob eine Notiz aus einer Antwort entstanden ist und Belege trägt. */
export function hasCitations(note: Note): boolean {
  return (note.segments ?? []).some((segment) => segment.citations.length > 0);
}

export function citationCount(note: Note): number {
  return (note.segments ?? []).reduce((total, segment) => total + segment.citations.length, 0);
}
