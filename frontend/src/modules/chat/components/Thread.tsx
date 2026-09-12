'use client';

import type { ReactNode } from 'react';

import type { Citation } from '@/lib/citation';
import { Answer } from './Answer';
import { Banner } from './Banner';
import { Thinking } from './Thinking';
import type { Message, TurnState } from '../types/message';

export interface ThreadProps {
  /**
   * The overview, above the first turn and scrolling with it.
   *
   * Passed in rather than imported: it belongs to the notebooks module, and a
   * module may not import another one. It scrolls away on purpose - it is what
   * the notebook is about, which matters most before the first question.
   */
  header?: ReactNode;
  messages: Message[];
  state?: TurnState;
  /** How many sources the running turn is reading. */
  sourceCount?: number;
  onOpenCitation: (citation: Citation) => void;
  /** Reicht "Save to note" an jede Antwort durch; siehe `Answer`. */
  onSaveToNote?: (messageId: string) => void;
  /** One sentence, from the server's error event. Never the upstream message. */
  error?: string | null;
  onRetry?: () => void;
}

/**
 * The conversation.
 *
 * A question sits right in a box, an answer runs full width in the reading
 * serif. That is not decoration: the answer is the thing being read, and giving
 * it the measure and the typeface of a document is what separates it from a
 * chat log.
 */
export function Thread({
  header,
  messages,
  state = 'idle',
  sourceCount = 0,
  onOpenCitation,
  onSaveToNote,
  error = null,
  onRetry,
}: ThreadProps) {
  const last = messages.at(-1);
  const streamingMessage = state === 'streaming' && last?.role === 'assistant' ? last : null;

  return (
    <div className="mx-auto grid max-w-[var(--measure)] gap-6 px-5 py-6" data-testid="thread">
      {header}

      {messages.map((message) =>
        message.role === 'user' ? (
          <article key={message.id} className="grid gap-2" data-testid="question">
            <div className="max-w-[46ch] justify-self-end rounded-[10px] rounded-br-[2px] border border-rule bg-surface px-4 py-3 text-ui-lg">
              {message.text}
            </div>
          </article>
        ) : (
          <div key={message.id} className="grid gap-3">
            <Answer
              onSaveToNote={onSaveToNote}
              message={message}
              onOpenCitation={onOpenCitation}
              streaming={streamingMessage?.id === message.id}
            />

            {message.droppedCitations > 0 ? (
              <Banner title="One citation was removed">
                A quoted passage did not match the stored source text, so it was dropped rather than
                shown. The rest of the answer is unchanged.
              </Banner>
            ) : null}

            {message.truncated ? (
              <Banner tone="notice" title="The answer stopped at its length limit">
                What stands above is complete as far as it goes, and every citation in it was
                checked. Ask a narrower question to get the rest.
              </Banner>
            ) : null}

            {message.stopped ? (
              <div className="flex items-center gap-3 text-small text-ink-faint">
                {/* Precise on purpose. Every chip above was checked like any
                    other, so the passages can be opened - but a turn that was
                    stopped is never written to the notebook, and saying "kept"
                    would promise it back after a reload. */}
                <span>
                  Stopped. What arrived stays on screen and its passages can be opened; it is not
                  saved to this notebook.
                </span>
              </div>
            ) : null}
          </div>
        )
      )}

      {state === 'thinking' ? <Thinking sourceCount={sourceCount} /> : null}

      {state === 'error' && error ? (
        <Banner
          tone="danger"
          title="The answer could not be generated"
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-[32px] items-center rounded-control border border-rule-strong bg-surface px-3 text-ui font-medium hover:bg-surface-sunken"
              >
                Try again
              </button>
            ) : null
          }
        >
          {error}
        </Banner>
      ) : null}
    </div>
  );
}
