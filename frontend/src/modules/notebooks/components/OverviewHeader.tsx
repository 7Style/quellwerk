'use client';

import { Icon } from '@/components/icon';
import type { NotebookSummary } from '../types/notebook';

export interface OverviewHeaderProps {
  notebook: NotebookSummary;
  /** Puts a question in the composer. It is not asked until the reader sends it. */
  onAsk: (question: string) => void;
  /** No sources yet: there is nothing to summarise and nothing to ask about. */
  onAddSource?: () => void;
}

/**
 * What the notebook is about, above the conversation.
 *
 * Written by the overview job after the first source is ready, from the sources
 * themselves (`prompts/notebook-overview.md`). It is not chrome: a reader who
 * opens a notebook from yesterday needs to know what is in it before the first
 * question, and the four questions are the cheapest way to start - they come
 * from the documents, so each one is answerable from them.
 *
 * Clicking one fills the composer rather than sending it. The reader may want
 * to narrow it, and a click that spends money without a second step is a click
 * people learn to fear.
 */
export function OverviewHeader({ notebook, onAsk, onAddSource }: OverviewHeaderProps) {
  const questions = notebook.suggestedQuestions ?? [];
  const empty = notebook.sourceCount === 0;

  return (
    <header className="grid gap-3" data-testid="overview">
      <div className="flex items-baseline gap-3">
        <span className="text-[28px] leading-none">{notebook.emoji}</span>
        {/* The page's h1. The topbar keeps a plain copy, not a heading, for
            after this has scrolled away: two headings with the same name make a
            reader navigating by heading hear the notebook twice. */}
        <h1 className="m-0 text-h2 font-semibold tracking-[-0.01em]">{notebook.title}</h1>
      </div>

      {empty ? (
        <>
          <p className="m-0 font-read text-read leading-read text-ink-muted">
            Quellwerk answers only from the sources in this notebook. Add one, and its summary and
            first questions appear here.
          </p>
          {onAddSource ? (
            <button
              type="button"
              onClick={onAddSource}
              className="inline-flex h-[32px] items-center gap-2 justify-self-start rounded-control border border-rule-strong bg-surface px-3 text-ui font-medium hover:bg-surface-sunken"
            >
              <Icon name="plus" />
              Add source
            </button>
          ) : null}
        </>
      ) : null}

      {!empty && notebook.summary ? (
        <p className="m-0 font-read text-read leading-read" data-testid="overview-summary">
          {notebook.summary}
        </p>
      ) : null}

      {!empty && !notebook.summary ? (
        <p className="m-0 text-ink-muted" data-testid="overview-pending">
          Reading the sources. The summary and the first questions appear when that is done.
        </p>
      ) : null}

      {questions.length > 0 ? (
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="overview-questions">
          {questions.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => onAsk(question)}
                className="w-full rounded-control border border-rule bg-surface px-3 py-2 text-left text-ui-lg hover:border-ink-faint"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
