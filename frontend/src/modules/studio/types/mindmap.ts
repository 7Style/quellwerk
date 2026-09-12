/**
 * Die Mind Map eines Notizbuchs, wie die Route sie schickt
 * (backend/app/modules/studio/dto/studio.dto.ts).
 *
 * Eine flache Liste mit Ebenen und keine Baumstruktur: so kommt sie aus dem
 * Modell, so liegt sie in der Spalte, und so wird sie gezeichnet. Ein Baum
 * waere eine zweite Form desselben, die jemand pflegen muesste.
 */
export interface MindMapNode {
  id: string;
  label: string;
  parentId: string | null;
  /** 0 Wurzel, 1 Zweig, 2 Blatt. */
  depth: number;
}

export interface MindMap {
  id: string;
  notebookId: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
  error: string | null;
  nodes: MindMapNode[];
  createdAt: string;
  finishedAt: string | null;
}

export function isDrawing(map: MindMap | null): boolean {
  return map?.status === 'queued' || map?.status === 'running';
}

/**
 * Die Frage, die ein Klick auf einen Knoten ins Eingabefeld schreibt.
 *
 * Geschrieben und nicht abgeschickt: der Leser will sie vielleicht enger
 * stellen, und ein Klick, der Geld ausgibt, ist ein Klick, den man fuerchten
 * lernt (dieselbe Regel wie bei den vorgeschlagenen Fragen der Uebersicht).
 */
export function questionFor(node: MindMapNode): string {
  return `What do the sources say about ${node.label}?`;
}
