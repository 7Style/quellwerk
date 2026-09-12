'use client';

import { useMemo, type ReactNode } from 'react';

import { citeQuote, highlightOf, type Citation } from '@/lib/citation';
import { Workspace } from '@/modules/shell';
import { SourcesPanel, SourceViewer, useSourceViewer, type SourceSummary } from '@/modules/sources';

export interface NotebookWorkspaceProps {
  sources: SourceSummary[];
  /** Source id to stored text. M4-T6 fetches it by id instead. */
  texts: Record<string, string>;
  studio: ReactNode;
}

/**
 * The client half of a notebook: which source is open and what is marked in it.
 *
 * The state sits here because two columns share it. A citation chip in the chat
 * opens a source at a passage, a row in the list opens it at the top, and both
 * end up in the same viewer. Sources and chat are separate modules that may not
 * import each other, so the place that knows about both is the route, and this
 * is the client part of it.
 */
export function NotebookWorkspace({ sources, texts, studio }: NotebookWorkspaceProps) {
  const viewer = useSourceViewer();

  // The temporary stand-in for the thread. M4-T4 replaces it with the real
  // answer and its chips; both call `viewer.open` with the same citation, so
  // what is being built here is the wiring and not a throwaway.
  const citations = useMemo(() => passageFixtures(sources, texts), [sources, texts]);

  const open = viewer.target
    ? sources.find((source) => source.id === viewer.target?.sourceId)
    : null;

  return (
    <Workspace
      sourceCount={sources.length}
      sourcesFill
      sources={
        viewer.target && open ? (
          <SourceViewer
            source={{ id: open.id, title: open.title, text: texts[open.id] ?? '' }}
            highlight={viewer.target.highlight}
            onClose={viewer.close}
          />
        ) : (
          <SourcesPanel
            sources={sources}
            onOpen={(id) => viewer.open(id)}
            currentSourceId={viewer.target?.sourceId}
          />
        )
      }
      chat={
        <div className="mx-auto max-w-[var(--measure)] px-6 py-8">
          <p className="m-0 font-read text-read leading-read text-ink-muted">
            Ask a question about your sources. Every sentence of the answer carries the passage it
            came from.
          </p>

          <ul className="mt-5 grid list-none gap-2 p-0">
            {citations.map((citation, index) => (
              <li key={`${citation.sourceId}-${citation.start}`}>
                <button
                  type="button"
                  data-testid={`chip-${index + 1}`}
                  onClick={() => viewer.open(citation.sourceId, highlightOf(citation))}
                  className="w-full rounded-chip border border-cite-wash-strong bg-cite-wash px-2 py-1 text-left text-ui text-cite-ink hover:border-cite"
                >
                  {citation.sourceTitle}: {citation.text.slice(0, 60)}
                  {citation.text.length > 60 ? '…' : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      }
      studio={studio}
    />
  );
}

/** Four passages across two sources, with offsets taken from the text itself. */
function passageFixtures(sources: SourceSummary[], texts: Record<string, string>): Citation[] {
  const quotes: Array<[string, string]> = [
    ['s1', 'throughout the entire lifecycle of the high-risk AI system'],
    [
      's1',
      'Training, validation and testing data sets shall be relevant, sufficiently representative',
    ],
    ['s1', 'shall be drawn up before that system is placed on the market'],
    ['s2', 'The rules for high-risk AI systems will apply starting 2 December 2027.'],
  ];

  return quotes.flatMap(([sourceId, quote]) => {
    const source = sources.find((candidate) => candidate.id === sourceId);
    const text = texts[sourceId];
    if (!source || !text) return [];
    return [citeQuote({ id: source.id, title: source.title, text }, quote)];
  });
}
