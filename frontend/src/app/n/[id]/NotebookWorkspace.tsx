'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { citeQuote, highlightOf, type Citation } from '@/lib/citation';
import {
  Composer,
  Thread,
  suggestionFixtures,
  threadFixture,
  type Message,
  type TurnState,
} from '@/modules/chat';
import { Workspace } from '@/modules/shell';
import { SourcesPanel, SourceViewer, useSourceViewer, type SourceSummary } from '@/modules/sources';

export interface NotebookWorkspaceProps {
  sources: SourceSummary[];
  /** Source id to stored text. M4-T6 fetches it by id instead. */
  texts: Record<string, string>;
  studio: ReactNode;
}

/**
 * The client half of a notebook: which source is open, what is marked in it,
 * and the conversation.
 *
 * The state sits here because the columns share it. A citation chip in the chat
 * opens a source at a passage, a row in the list opens it at the top, and both
 * end up in the same viewer. Sources and chat are separate modules that may not
 * import each other, so the place that knows about both is the route, and this
 * is the client part of it.
 */
export function NotebookWorkspace({ sources, texts, studio }: NotebookWorkspaceProps) {
  const viewer = useSourceViewer();

  /** Resolves a fixture quote against the real document (lib/citation.ts). */
  const cite = useCallback(
    (sourceId: string, quote: string): Citation => {
      const source = sources.find((candidate) => candidate.id === sourceId);
      const text = texts[sourceId] ?? '';
      return citeQuote({ id: sourceId, title: source?.title ?? sourceId, text }, quote);
    },
    [sources, texts]
  );

  const [messages, setMessages] = useState<Message[]>(() => threadFixture(cite));
  const [state, setState] = useState<TurnState>('idle');
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => sources.filter((source) => source.status === 'ready'), [sources]);

  const ask = useCallback((question: string) => {
    // The question is kept in the thread so the reader sees what was asked, and
    // the turn ends at once in a state that says what happened. M4-T6 replaces
    // this with the SSE client; until then nothing is sent, and the interface
    // says so rather than turning a spinner.
    setMessages((current) => [
      ...current,
      { id: `q-${current.length}`, role: 'user', text: question },
    ]);
    setState('error');
    setError(
      'Nothing was sent. This build draws the conversation from fixtures; asking reaches the server in the next step.'
    );
  }, []);

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
        <Thread
          messages={messages}
          state={state}
          sourceCount={ready.length}
          onOpenCitation={(citation) => viewer.open(citation.sourceId, highlightOf(citation))}
          error={error}
          onRetry={() => {
            setState('idle');
            setError(null);
          }}
        />
      }
      composer={
        <Composer
          suggestions={suggestionFixtures}
          onAsk={ask}
          meta={`${ready.length} of ${sources.length} sources ready`}
        />
      }
      studio={studio}
    />
  );
}
