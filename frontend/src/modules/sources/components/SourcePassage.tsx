'use client';

import { useEffect, useRef } from 'react';

import type { Highlight } from '@/lib/citation';

export interface SourcePassageProps {
  /** The stored text, normalised once at ingest and never touched since. */
  text: string;
  highlight: Highlight | null;
}

/**
 * The source text, with the cited range marked.
 *
 * Three slices of one string and nothing else: `[0, start)`, `[start, end)`,
 * `[end, ...)`. That is the whole implementation, and it has to stay that way.
 * The offsets index into the text that was sent to the model and stored
 * unchanged (ADR-0003), so any reflowing, trimming or re-wrapping here would
 * put the mark somewhere other than where the citation points, and the mark is
 * the product's one claim. `whitespace-pre-wrap` keeps the line breaks the
 * stored text has instead of inventing paragraphs.
 *
 * A range that does not fit the text is drawn without a mark rather than
 * clamped. The server has already checked every citation it sent; if one
 * arrives that does not fit, the honest thing is to show the document and no
 * mark, not to mark an approximation.
 */
export function SourcePassage({ text, highlight }: SourcePassageProps) {
  const markRef = useRef<HTMLElement | null>(null);

  const usable =
    highlight !== null &&
    highlight.start >= 0 &&
    highlight.end <= text.length &&
    highlight.start < highlight.end;

  useEffect(() => {
    if (!usable) return;
    markRef.current?.scrollIntoView({ block: 'center' });
  }, [usable, highlight?.start, highlight?.end, text]);

  return (
    <article
      // 15px, from design/styles.css .reader-body: the reading serif at the
      // chat's 17px is too large for a 300px column. The tall bottom padding
      // lets a passage near the end still be centred by scrollIntoView.
      className="px-4 pt-4 pb-8 font-read text-[0.9375rem] leading-read whitespace-pre-wrap"
      data-testid="source-text"
    >
      {usable ? (
        <>
          {text.slice(0, highlight.start)}
          {/* No horizontal padding. The mark sits inside running text, and
              padding on the sides would push the words around it apart, which
              is a small lie about where the passage ends. The underline in the
              accent does the work instead. */}
          <mark
            ref={markRef}
            data-testid="passage-mark"
            className="rounded-[2px] bg-cite-wash-strong py-px text-ink shadow-[inset_0_-2px_0_var(--accent)]"
          >
            {text.slice(highlight.start, highlight.end)}
          </mark>
          {text.slice(highlight.end)}
        </>
      ) : (
        text
      )}
    </article>
  );
}
