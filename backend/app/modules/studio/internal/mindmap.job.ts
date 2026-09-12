/**
 * Die Mind Map eines Notizbuchs.
 *
 * Derselbe Job-Pfad wie ein Report: eine Zeile in `artifacts`, die
 * Artefakt-Warteschlange, ein Heartbeat vor dem Modellaufruf und ein
 * Endzustand, immer. Was anders ist, ist der Aufruf selbst -- Structured
 * Outputs statt Text mit Belegen, weil eine Knotenliste keine Zitate trägt und
 * beides ohnehin nicht zusammengeht (CLAUDE.md, HTTP 400).
 *
 * Das Schema trägt keine Längen- und keine Anzahlgrenzen. Die API streicht sie
 * aus einem Structured-Output-Schema, statt sie durchzusetzen
 * (prompts/README.md), also stünden sie da als Behauptung. Was gelten soll,
 * steht deshalb unten in `tidy` und wird dort geprüft.
 */
import { z } from 'zod';

/** Was das Modell liefert. Ohne `.max()`, ohne `.min()`: siehe oben. */
export const mindMapSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      parentId: z.string().nullable(),
    })
  ),
});

export type MindMapDraft = z.infer<typeof mindMapSchema>;

export interface MindMapNode {
  id: string;
  label: string;
  parentId: string | null;
  /** 0 für die Wurzel, 1 für einen Zweig, 2 für ein Blatt. */
  depth: number;
}

/** Die Regeln, die im Schema nichts zu suchen haben. */
export const MAX_NODES = 40;
export const MAX_DEPTH = 2;
const MAX_LABEL_CHARS = 80;

/**
 * Macht aus dem Entwurf eine Karte, die sich zeichnen lässt.
 *
 * Sie wirft nicht. Ein Modell, das einen Knoten unter ein Elternteil hängt, das
 * es nie geschrieben hat, hat einen Knoten verloren - nicht die Karte. Was
 * hier passiert, ist deshalb durchweg: weglassen, nicht abbrechen.
 *
 * Die Reihenfolge ist die Reihenfolge des Modells, innerhalb der Ebenen: es hat
 * die Zweige in eine Ordnung gebracht, und die ist besser als alphabetisch.
 */
export function tidy(draft: MindMapDraft): MindMapNode[] {
  const seen = new Set<string>();
  const cleaned = draft.nodes
    .map((node) => ({
      id: node.id.trim(),
      label: node.label.trim().slice(0, MAX_LABEL_CHARS),
      parentId: node.parentId?.trim() ? node.parentId.trim() : null,
    }))
    .filter((node) => {
      if (node.id.length === 0 || node.label.length === 0) return false;
      // Ein zweiter Knoten mit derselben Id wäre ein Elternteil, das zweimal
      // existiert; der erste gewinnt.
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });

  // Genau eine Wurzel. Nennt das Modell mehrere, gewinnt die erste, und die
  // anderen werden zu Zweigen unter ihr: eine Karte mit zwei Wurzeln ist zwei
  // Karten, und der Leser sieht nur eine davon.
  const roots = cleaned.filter((node) => node.parentId === null);
  const root = roots[0];
  if (!root) return [];

  const byId = new Map(cleaned.map((node) => [node.id, node]));
  const out: MindMapNode[] = [{ ...root, parentId: null, depth: 0 }];
  const placed = new Map<string, number>([[root.id, 0]]);

  // Erst die Ebenen bestimmen, Ebene für Ebene: ein Kind kennt seine Tiefe erst,
  // wenn sein Elternteil eine hat.
  const kept: MindMapNode[] = [];
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    for (const node of cleaned) {
      if (placed.has(node.id)) continue;
      if (kept.length + 1 >= MAX_NODES) break;

      const parentId = node.parentId ?? root.id;
      const parentDepth = placed.get(parentId);
      if (parentDepth !== depth - 1) continue;
      // Ein Elternteil, das es nicht gibt, lässt den Knoten fallen - ausser er
      // war als zweite Wurzel gemeint, dann hängt er unter der ersten.
      if (node.parentId !== null && !byId.has(node.parentId)) continue;

      kept.push({ id: node.id, label: node.label, parentId, depth });
      placed.set(node.id, depth);
    }
  }

  // Dann in die Reihenfolge bringen, in der gelesen wird: ein Zweig, seine
  // Blätter, der nächste Zweig. Ebene für Ebene ausgegeben stünden erst alle
  // Zweige und darunter alle Blätter, und ein Blatt sähe aus, als gehöre es
  // zum letzten Zweig darüber - im Screenshot der ersten echten Karte genau so
  // passiert.
  const childrenOf = (parentId: string): MindMapNode[] =>
    kept.filter((node) => node.parentId === parentId);

  for (const branch of childrenOf(root.id)) {
    out.push(branch);
    out.push(...childrenOf(branch.id));
  }

  // Ein Zweig ohne Blätter ist erlaubt: die Karte ist dann dünn, und das ist
  // eine Aussage über die Dokumente.
  return out;
}
