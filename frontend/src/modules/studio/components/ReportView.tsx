'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CitedText } from '@/components/cited-text';
import { Icon } from '@/components/icon';
import type { Citation } from '@/lib/citation';
import { relativeTime } from '@/lib/relative-time';
import { PromptDialog } from './PromptDialog';
import { FORMAT_LABELS, type ReportBody } from '../types/report';

export interface ReportViewProps {
  report: ReportBody | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onOpenCitation: (citation: Citation) => void;
}

/**
 * A finished report, in the column the conversation was in.
 *
 * Same renderer as an answer, so a chip here means what a chip there means: the
 * server sliced the stored text at those offsets and compared it before the chip
 * existed (ADR-0003). Clicking one opens the source at the passage, exactly as
 * in the chat.
 */
export function ReportView({
  report,
  loading = false,
  error = null,
  onClose,
  onOpenCitation,
}: ReportViewProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  const citations = report?.segments.reduce((total, one) => total + one.citations.length, 0) ?? 0;

  return (
    <div className="mx-auto grid max-w-[var(--measure)] gap-4 px-5 py-6" data-testid="report-view">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Back to the conversation"
          data-testid="report-close"
        >
          <Icon name="chevronLeft" />
        </Button>
        <span className="text-small text-ink-faint">
          {report ? FORMAT_LABELS[report.format] : 'Report'}
          {report?.finishedAt ? ` · written ${relativeTime(report.finishedAt)}` : ''}
        </span>
      </div>

      {loading ? (
        <div className="grid gap-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((line) => (
            <div key={line} className="h-[16px] w-full rounded bg-surface-sunken" />
          ))}
          <p className="sr-only" role="status">
            Opening the report
          </p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="grid gap-3" role="alert">
          <p className="m-0 text-ui font-medium">This report could not be opened.</p>
          <p className="m-0 text-ink-muted">{error}</p>
        </div>
      ) : null}

      {!loading && !error && report ? (
        <>
          <CitedText
            segments={report.segments}
            onOpenCitation={onOpenCitation}
            headings
            className="font-read text-read leading-read"
          />

          <div className="flex items-center gap-3 border-t border-rule pt-3 text-small text-ink-faint">
            {citations > 0 ? (
              <span className="inline-flex items-center gap-1 text-cite-ink tabular-nums">
                <Icon name="quote" className="h-[13px] w-[13px]" />
                {citations} {citations === 1 ? 'citation' : 'citations'}
              </span>
            ) : (
              <span>No citations</span>
            )}
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(plainText(report))}
            >
              <Icon name="copy" className="h-[14px] w-[14px]" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setPromptOpen(true)}
              data-testid="view-prompt"
            >
              <Icon name="sliders" className="h-[14px] w-[14px]" />
              View prompt used
            </Button>
          </div>
        </>
      ) : null}

      <PromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        prompt={report?.promptUsed ?? null}
      />
    </div>
  );
}

/** The report as text. Joined with nothing: the segments are one document. */
function plainText(report: ReportBody): string {
  return report.segments.map((segment) => segment.text).join('');
}
