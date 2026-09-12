'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import type { Citation } from '@/lib/citation';
import { refusalLead } from '@/lib/refusal';
import { CitationChip } from './CitationChip';
import { answerText, citationsOf, sourceCountOf, type AssistantMessage } from '../types/message';

export interface AnswerProps {
  message: AssistantMessage;
  onOpenCitation: (citation: Citation) => void;
  /** Drawn with a caret while the answer is still arriving. */
  streaming?: boolean;
}

/**
 * One answer: the segments in order, each with its chips, and a foot that says
 * how much of it is traceable.
 *
 * A refusal is drawn differently and carries no chip. That is not styling: the
 * route drops any citation under a refusal before it is sent (docs/SPEC.md), so
 * a refusal with a chip cannot arrive - and if one ever did, the reader would be
 * invited to check a claim nobody made.
 */
export function Answer({ message, onOpenCitation, streaming = false }: AnswerProps) {
  const citations = citationsOf(message);
  const lead = refusalLead(answerText(message));
  const refusal = lead !== null;

  // The number each segment's first chip carries, worked out before anything
  // renders. Counting up inside the JSX would be a variable reassigned during
  // render, which the React compiler refuses and which would give a different
  // answer the moment a segment is drawn twice.
  const firstNumber = message.segments.map((_, index) =>
    message.segments.slice(0, index).reduce((total, earlier) => total + earlier.citations.length, 0)
  );

  return (
    <article className="grid gap-2" data-testid="answer" data-refusal={refusal ? 'true' : 'false'}>
      {/* pre-wrap, not a markdown renderer. The model writes paragraphs as blank
          lines and this shows them as blank lines; parsing the answer would mean
          deciding what a stray asterisk meant, and an answer whose rendering is
          a guess is not what a citation should hang off. */}
      <div
        className={`font-read text-read leading-read whitespace-pre-wrap ${
          refusal ? 'border-l-2 border-rule-strong pl-4 text-ink-muted' : ''
        }`}
      >
        {message.segments.map((segment, segmentIndex) => (
          <span key={segmentIndex}>
            {/* The refusal sentence carries the reader's weight, so it is the
                one line in the block that is not muted. Split at the end of the
                sentence, not at the segment boundary: the API returns a refusal
                as a single block. */}
            {lead !== null && segmentIndex === 0 ? (
              <>
                <span className="font-medium text-ink">{lead}</span>
                {segment.text.slice(segment.text.indexOf(lead) + lead.length)}
              </>
            ) : (
              segment.text
            )}
            {segment.citations.map((citation, citationIndex) => (
              <CitationChip
                key={`${citation.sourceId}-${citation.start}`}
                citation={citation}
                index={firstNumber[segmentIndex] + citationIndex + 1}
                onOpen={onOpenCitation}
              />
            ))}
          </span>
        ))}
        {streaming ? (
          <span
            data-testid="caret"
            className="ml-px inline-block h-[1.05em] w-0.5 bg-ink align-[-0.15em] motion-safe:animate-[qw-blink_1s_steps(2,start)_infinite]"
          />
        ) : null}
      </div>

      {streaming ? null : (
        <div className="flex items-center gap-3 text-small text-ink-faint">
          {citations.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-cite-ink tabular-nums">
              <Icon name="quote" className="h-[13px] w-[13px]" />
              {citations.length} {citations.length === 1 ? 'citation' : 'citations'}
            </span>
          ) : (
            <span>No citations</span>
          )}
          {citations.length > 0 ? <span>{sourceCountOf(message)} sources</span> : null}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Copy answer"
            onClick={() => void navigator.clipboard?.writeText(answerText(message))}
            className="h-6 w-6"
          >
            <Icon name="copy" className="h-[14px] w-[14px]" />
          </Button>
        </div>
      )}
    </article>
  );
}
