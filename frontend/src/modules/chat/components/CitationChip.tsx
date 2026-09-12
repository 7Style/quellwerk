'use client';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { Citation } from '@/lib/citation';

export interface CitationChipProps {
  citation: Citation;
  /** Its number in the answer, counted across all segments. */
  index: number;
  onOpen: (citation: Citation) => void;
}

/**
 * The chip at the end of a sentence, and the card that shows what it points at.
 *
 * The accent belongs to provenance and to nothing else (styles/global.css), so
 * this and the mark in the viewer are the two places it appears in a message.
 *
 * The card names the source, the page and the character range. The range is not
 * decoration: it is the claim the server checked before this chip was sent, and
 * printing it is the difference between "trust me" and "look for yourself".
 */
export function CitationChip({ citation, index, onOpen }: CitationChipProps) {
  const where =
    citation.page === null
      ? `characters ${citation.start.toLocaleString('en-US')}-${citation.end.toLocaleString('en-US')}`
      : `page ${citation.page}, characters ${citation.start.toLocaleString('en-US')}-${citation.end.toLocaleString('en-US')}`;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid={`cite-${index}`}
          data-cite-source={citation.sourceId}
          onClick={() => onOpen(citation)}
          aria-label={`Citation ${index}: ${citation.sourceTitle}, ${where}`}
          className="ml-[3px] inline-flex h-4 min-w-[17px] items-center justify-center rounded-r-chip border-0 border-l-2 border-cite bg-cite-wash px-[3px] align-[0.12em] text-micro font-semibold text-cite-ink tabular-nums hover:bg-cite-wash-strong"
        >
          {index}
        </button>
      </HoverCardTrigger>

      <HoverCardContent
        align="start"
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-surface border-rule-strong bg-surface-raised px-4 py-3 shadow-pop"
        data-testid={`cite-card-${index}`}
      >
        <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-rule pb-2">
          <span className="truncate text-small font-semibold">{citation.sourceTitle}</span>
          <span className="text-small whitespace-nowrap text-ink-faint tabular-nums">{where}</span>
        </div>
        <div className="max-h-[190px] overflow-y-auto font-read text-[0.875rem] leading-[1.6] text-ink-muted">
          <mark className="rounded-[2px] bg-cite-wash py-px text-ink">{citation.text}</mark>
        </div>
        <div className="mt-3 text-small text-ink-faint">Click to open the source here.</div>
      </HoverCardContent>
    </HoverCard>
  );
}
