'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';

/** docs/SPEC.md: the route's zod schema caps a question at 4,000 characters. */
const MAX_QUESTION_CHARS = 4_000;

export interface ComposerProps {
  /**
   * The text in the box, owned by the caller.
   *
   * Two things outside this component put a question in it: the follow-ups of
   * the last turn and the suggested questions of the overview header. Keeping
   * the text here would mean a second way in - a ref, or a prop that resets
   * state when it changes - for something that is simply shared.
   */
  value: string;
  onValueChange: (value: string) => void;
  /** Three follow-ups from the last turn. Clicking one fills the box. */
  suggestions?: string[];
  busy?: boolean;
  onAsk: (question: string) => void;
  onStop?: () => void;
  /** Right of the box: how many sources the answer will see. */
  meta?: string;
  onConfigure?: () => void;
}

/**
 * The box, the suggestions above it and the send button.
 *
 * Enter sends and Shift+Enter breaks the line, which is the convention every
 * chat has taught. The textarea grows with the text to a ceiling and then
 * scrolls, so a long question never pushes the thread off the screen.
 */
export function Composer({
  value,
  onValueChange,
  suggestions = [],
  busy = false,
  onAsk,
  onStop,
  meta,
  onConfigure,
}: ComposerProps) {
  const box = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  function send() {
    const asked = value.trim();
    if (!asked || busy) return;
    onAsk(asked);
    onValueChange('');
  }

  return (
    <div className="bg-gradient-to-t from-paper to-transparent px-5 pt-3 pb-5">
      <div className="mx-auto max-w-[var(--measure)]">
        {suggestions.length > 0 && !busy ? (
          <div className="mb-3 flex flex-wrap gap-2" data-testid="suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  onValueChange(suggestion);
                  box.current?.focus();
                }}
                className="inline-flex h-[28px] max-w-full items-center gap-2 truncate rounded-[14px] border border-rule-strong bg-surface px-3 text-ui text-ink-muted hover:border-ink-faint hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-surface border border-rule-strong bg-surface py-2 pr-2 pl-4 focus-within:border-ink">
          <label className="sr-only" htmlFor="composer">
            Ask a question about your sources
          </label>
          <textarea
            id="composer"
            ref={box}
            rows={1}
            value={value}
            maxLength={MAX_QUESTION_CHARS}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask a question about your sources"
            className="max-h-[160px] resize-none border-0 bg-transparent py-2 text-ui-lg leading-[1.5] placeholder:text-ink-faint focus:outline-none"
          />

          {busy && onStop ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onStop}
              aria-label="Stop"
              className="h-[32px] w-[32px]"
            >
              <Icon name="stop" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={send}
              disabled={value.trim().length === 0}
              aria-label="Send"
              className="h-[32px] w-[32px]"
            >
              <Icon name="send" />
            </Button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-small text-ink-faint">
          <span>{meta}</span>
          {onConfigure ? (
            <Button
              variant="ghost"
              type="button"
              onClick={onConfigure}
              className="h-6 px-2"
              size="sm"
            >
              <Icon name="sliders" className="h-[14px] w-[14px]" />
              Configure chat
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
