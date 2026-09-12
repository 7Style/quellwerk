'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { relativeTime } from '@/lib/relative-time';
import { CustomReportDialog } from './CustomReportDialog';
import {
  FORMAT_BLURBS,
  FORMAT_LABELS,
  isWriting,
  REPORT_FORMATS,
  type ReportFormat,
  type ReportSummary,
} from '../types/report';

export interface StudioPanelProps {
  reports: ReportSummary[];
  loading?: boolean;
  /** Rejecting is how a refusal from the server reaches the reader. */
  onRequest: (input: { format: ReportFormat; focus?: string }) => Promise<void>;
  onOpen: (reportId: string) => void;
  onRetry: (reportId: string) => Promise<void>;
  openReportId?: string;
  /** No sources, no report: the panel says so instead of offering a page of nothing. */
  hasSources: boolean;
  /**
   * Reports that have been "being written" for longer than that can mean.
   *
   * Decided one level up, where the clock lives, because reading the time
   * during render would make two renders in the same second disagree.
   */
  stuck?: readonly string[];
}

/**
 * The right column: what can be written, and what has been.
 *
 * The formats that already exist are not offered a second time. Asking for a
 * Briefing Doc twice gives the same one back (the route is idempotent), so an
 * enabled button that quietly does nothing would be the interface promising a
 * second report the server will not write.
 */
export function StudioPanel({
  reports,
  loading = false,
  onRequest,
  onOpen,
  onRetry,
  openReportId,
  hasSources,
  stuck = [],
}: StudioPanelProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<ReportFormat | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const written = new Set(
    reports.filter((one) => one.format !== 'custom').map((one) => one.format)
  );

  async function request(format: ReportFormat, focus?: string): Promise<boolean> {
    setFailure(null);
    setPending(format);
    try {
      await onRequest({ format, focus });
      return true;
    } catch (cause) {
      setFailure(messageOf(cause));
      return false;
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-3" data-testid="studio">
      <section className="grid gap-2">
        <h3 className="m-0 text-ui font-semibold text-ink-muted">Reports</h3>

        {!hasSources ? (
          <p className="m-0 rounded-control border border-dashed border-rule-strong p-4 text-ui text-ink-muted">
            A report is written from the sources. Add one first.
          </p>
        ) : null}

        {REPORT_FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            data-testid={`request-${format}`}
            disabled={!hasSources || written.has(format) || pending !== null}
            onClick={() => (format === 'custom' ? setCustomOpen(true) : void request(format))}
            className="grid w-full grid-cols-[20px_1fr_auto] items-center gap-3 rounded-control border-rule bg-surface p-3 text-left hover:border-rule-strong hover:bg-surface-sunken disabled:opacity-45"
          >
            <Icon name="report" className="text-ink-muted" />
            <span>
              <span className="block text-ui font-medium">{FORMAT_LABELS[format]}</span>
              <span className="mt-px block text-micro text-ink-faint">
                {written.has(format) ? 'Already written, below' : FORMAT_BLURBS[format]}
              </span>
            </span>
            <Icon name={pending === format ? 'refresh' : 'plus'} className="text-ink-muted" />
          </button>
        ))}

        {failure ? (
          <p className="m-0 text-small text-danger" role="alert" data-testid="studio-error">
            {failure}
          </p>
        ) : null}
      </section>

      <section className="grid gap-2">
        <h3 className="m-0 text-ui font-semibold text-ink-muted">Written</h3>

        {loading ? (
          <div className="grid gap-2" aria-hidden="true">
            {[0, 1].map((slot) => (
              <div key={slot} className="h-[52px] rounded-control border border-rule p-3">
                <div className="h-[13px] w-3/5 rounded bg-surface-sunken" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && reports.length === 0 ? (
          <p className="m-0 text-micro text-ink-faint">
            Nothing yet. A report takes about half a minute.
          </p>
        ) : null}

        {reports.map((report) => (
          <ReportRow
            key={report.id}
            report={report}
            current={report.id === openReportId}
            stuck={stuck.includes(report.id)}
            onOpen={() => onOpen(report.id)}
            onRetry={() => onRetry(report.id)}
          />
        ))}
      </section>

      <CustomReportDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onSubmit={(focus) => request('custom', focus)}
      />
    </div>
  );
}

function ReportRow({
  report,
  current,
  stuck,
  onOpen,
  onRetry,
}: {
  report: ReportSummary;
  current: boolean;
  stuck: boolean;
  onOpen: () => void;
  onRetry: () => Promise<void>;
}) {
  const writing = isWriting(report) && !stuck;

  return (
    <div
      data-report={report.id}
      data-status={report.status}
      className={`grid gap-2 rounded-control border p-3 ${
        current
          ? 'border-rule-strong bg-surface-sunken shadow-[inset_2px_0_0_var(--ink)]'
          : 'border-rule bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={report.status !== 'ready'}
        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 text-left disabled:cursor-default"
      >
        <Icon name="report" className="text-ink-muted" />
        <span className="min-w-0">
          <span className="block truncate text-ui font-medium">
            {report.title ?? FORMAT_LABELS[report.format]}
          </span>
          <span
            className="mt-px block text-micro text-ink-faint"
            data-testid={`state-${report.id}`}
          >
            {stateLine(report, stuck)}
          </span>
        </span>
        {report.status === 'ready' ? <Icon name="chevronRight" className="text-ink-muted" /> : null}
      </button>

      {writing ? (
        // A bar that fills is a lie about a duration nobody knows. This one
        // moves to say something is happening and claims no progress.
        <span
          aria-hidden="true"
          className="block h-[3px] overflow-hidden rounded-[2px] bg-surface-sunken"
        >
          <span className="block h-full w-1/3 bg-ink-faint motion-safe:animate-[qw-slide_1.4s_ease-in-out_infinite]" />
        </span>
      ) : null}

      {stuck ? (
        // Not a spinner that never ends (docs/SPEC.md). There is no retry here:
        // the route only takes a report that failed, and this row never did -
        // the sweeper that makes it terminal arrives in M7-T5.
        <p className="m-0 text-micro text-ink-muted" data-testid={`stuck-${report.id}`}>
          A report takes about half a minute. This one has been waiting for minutes, which means the
          writer on the server did not pick it up. The rest of the notebook works.
        </p>
      ) : null}

      {report.status === 'failed' ? (
        <div className="grid gap-2">
          <span className="text-micro text-danger">{report.error}</span>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void onRetry()}
            className="justify-self-start"
            data-testid={`retry-${report.id}`}
          >
            <Icon name="refresh" className="h-[14px] w-[14px]" />
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** What is happening to this report, in words rather than a spinner alone. */
function stateLine(report: ReportSummary, stuck = false): string {
  if (stuck) return 'Taking too long';
  if (report.status === 'queued') return 'Waiting for the writer';
  if (report.status === 'running') return 'Reading the sources and writing';
  if (report.status === 'failed') return 'Could not be written';
  return `Written ${relativeTime(report.finishedAt ?? report.createdAt)}`;
}

function messageOf(cause: unknown): string {
  const body = (cause as { data?: { error?: { message?: string } } } | null)?.data?.error;
  return body?.message ?? 'That did not work. Nothing was written.';
}
