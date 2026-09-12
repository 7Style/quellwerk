'use client';

import { Button } from '@/components/ui/button';
import { CitedText } from '@/components/cited-text';
import { Icon } from '@/components/icon';
import type { Citation } from '@/lib/citation';
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
/** Up to and including the first full stop, or nothing when there is none. */
function leadSentence(text: string): string | null {
  const stop = text.indexOf('. ');
  if (stop === -1) return text.trimEnd().endsWith('.') ? text : null;
  return text.slice(0, stop + 1);
}

export function Answer({ message, onOpenCitation, streaming = false }: AnswerProps) {
  const citations = citationsOf(message);
  const refusal = message.refused;
  // The refusal sentence is the first sentence, which the frozen system prompt
  // guarantees, so the first full stop is where it ends. Reading that out of
  // the text is what keeps the two sentences themselves on the server.
  const lead = refusal ? leadSentence(message.segments[0]?.text ?? '') : null;

  return (
    <article className="grid gap-2" data-testid="answer" data-refusal={refusal ? 'true' : 'false'}>
      <CitedText
        segments={message.segments}
        onOpenCitation={onOpenCitation}
        caret={streaming}
        lead={lead}
        className={`font-read text-read leading-read ${
          refusal ? 'border-l-2 border-rule-strong pl-4 text-ink-muted' : ''
        }`}
      />

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
          {citations.length > 0 ? (
            <span>
              {sourceCountOf(message)} {sourceCountOf(message) === 1 ? 'source' : 'sources'}
            </span>
          ) : null}
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
