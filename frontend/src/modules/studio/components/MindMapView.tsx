'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { isDrawing, questionFor, type MindMap, type MindMapNode } from '../types/mindmap';

export interface MindMapViewProps {
  map: MindMap | null;
  loading?: boolean;
  onClose: () => void;
  /** Schreibt die Frage ins Eingabefeld; abgeschickt wird sie nicht. */
  onAsk: (question: string) => void;
  onRebuild: () => Promise<void>;
}

/**
 * Die Mind Map in der Spalte des Gesprächs.
 *
 * Gezeichnet als Liste mit Ebenen und nicht als Graph mit Kanten. Das ist die
 * Entscheidung, die die Aufgabe trägt: eine Karte soll gelesen werden können,
 * und eine Liste mit drei Ebenen liest sich auf jedem Bildschirm, auch auf
 * einem, der gerade aufgezeichnet wird. Ein Layout mit Positionen wäre eine
 * Bibliothek, ein Tag Arbeit und eine Zeichnung, in der man scrollt, um zu
 * sehen, was man sucht.
 *
 * Jeder Knoten ist ein Knopf: ein Klick schreibt eine Frage danach ins
 * Eingabefeld. Die Karte sagt, was in den Quellen steht; die Antwort auf die
 * Frage sagt es mit Belegen.
 */
export function MindMapView({ map, loading = false, onClose, onAsk, onRebuild }: MindMapViewProps) {
  const nodes = map?.nodes ?? [];
  const root = nodes.find((node) => node.depth === 0) ?? null;
  const drawing = isDrawing(map);

  return (
    <div className="mx-auto grid max-w-[var(--measure)] gap-4 px-5 py-6" data-testid="mindmap-view">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Back to the conversation"
          data-testid="mindmap-close"
        >
          <Icon name="chevronLeft" />
        </Button>
        <span className="text-small text-ink-faint">Mind map</span>
        <span className="flex-1" />
        {map && !drawing ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => void onRebuild()}
            data-testid="mindmap-rebuild"
          >
            <Icon name="refresh" className="h-[14px] w-[14px]" />
            Build again
          </Button>
        ) : null}
      </div>

      {loading || drawing ? (
        <div className="grid gap-3">
          <p className="m-0 text-ui text-ink-muted" role="status" data-testid="mindmap-state">
            Reading the sources and drawing the map
          </p>
          <span
            aria-hidden="true"
            className="block h-[3px] overflow-hidden rounded-[2px] bg-surface-sunken"
          >
            <span className="block h-full w-1/3 bg-ink-faint motion-safe:animate-[qw-slide_1.4s_ease-in-out_infinite]" />
          </span>
        </div>
      ) : null}

      {!loading && map?.status === 'failed' ? (
        <div className="grid gap-2" role="alert">
          <p className="m-0 text-ui font-medium">The map could not be built.</p>
          <p className="m-0 text-ink-muted">{map.error}</p>
        </div>
      ) : null}

      {!loading && !drawing && root ? (
        <>
          <h1 className="m-0 font-ui text-h2 font-semibold tracking-[-0.01em]">{root.label}</h1>
          <p className="m-0 text-small text-ink-faint">
            {nodes.length - 1} {nodes.length - 1 === 1 ? 'topic' : 'topics'} from the sources. Click
            one to ask about it.
          </p>

          <ul className="m-0 grid list-none gap-1 p-0" data-testid="mindmap-nodes">
            {nodes
              .filter((node) => node.depth > 0)
              .map((node) => (
                <li key={node.id} style={{ paddingLeft: `${(node.depth - 1) * 20}px` }}>
                  <Branch node={node} onAsk={onAsk} />
                </li>
              ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Branch({ node, onAsk }: { node: MindMapNode; onAsk: (question: string) => void }) {
  const branch = node.depth === 1;

  return (
    <button
      type="button"
      data-node={node.id}
      onClick={() => onAsk(questionFor(node))}
      className={`flex w-full items-center gap-2 rounded-control border border-transparent px-2 py-1.5 text-left hover:border-rule hover:bg-surface-sunken ${
        branch ? 'text-ui-lg font-medium' : 'text-ui text-ink-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${branch ? 'bg-ink' : 'bg-ink-faint'}`}
      />
      {node.label}
    </button>
  );
}
