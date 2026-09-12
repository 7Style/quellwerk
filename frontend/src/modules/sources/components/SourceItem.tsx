import { Icon, type IconName } from '@/components/icon';
import { isUsable, type IngestStep, type SourceKind, type SourceSummary } from '../types/source';

const ICON_FOR: Record<SourceKind, IconName> = {
  pdf: 'doc',
  docx: 'doc',
  txt: 'text',
  md: 'text',
  paste: 'text',
};

const KIND_LABEL: Record<SourceKind, string> = {
  pdf: 'PDF',
  docx: 'Word',
  txt: 'Text',
  md: 'Markdown',
  paste: 'Pasted text',
};

/**
 * What the worker is doing, in words a reader owns.
 *
 * The step names are the job's (backend/app/modules/sources/internal/
 * ingest.job.ts) and they are about the pipeline; these are about the document.
 * A source that is queued with no step yet is waiting, and saying so is better
 * than an empty line that reads like a stall.
 */
const STEP_LABEL: Record<IngestStep, string> = {
  extract: 'Reading the document',
  measure: 'Counting tokens',
  guide: 'Summarising',
  title: 'Naming the notebook',
  done: 'Finishing',
};

function metaFor(source: SourceSummary): string {
  if (source.status === 'failed') return source.error ?? 'Could not be read';
  if (source.status === 'ready') {
    // Tokens, not pages. The page count is not in the API response, and tokens
    // are the number that decides whether the next source still fits
    // (docs/SPEC.md, 150,000 per notebook).
    return `${KIND_LABEL[source.kind]} · ${source.tokenCount.toLocaleString('en-US')} tokens`;
  }
  return source.step ? STEP_LABEL[source.step] : 'Waiting to be read';
}

function dotClass(source: SourceSummary): string {
  if (source.status === 'failed') return 'bg-danger';
  if (source.status === 'ready') return 'bg-ink-muted';
  return 'bg-notice';
}

export interface SourceItemProps {
  source: SourceSummary;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  /** Opens the source in the viewer (M4-T3). */
  onOpen?: (id: string) => void;
  /** The source the viewer is currently showing. */
  current?: boolean;
}

/**
 * One row: a checkbox, a kind icon, the title over its state.
 *
 * The row is a button and the checkbox sits inside it, which cannot be nested
 * in HTML, so the checkbox is a sibling and the button covers the rest. That
 * also separates the two actions a reader has here: opening a source and
 * choosing whether it is used.
 */
export function SourceItem({
  source,
  selected,
  onSelectedChange,
  onOpen,
  current = false,
}: SourceItemProps) {
  const usable = isUsable(source);

  return (
    <div
      data-source={source.id}
      data-state={source.status}
      aria-current={current ? 'true' : undefined}
      className={`grid grid-cols-[auto_16px_1fr] items-start gap-2 rounded-control border border-transparent p-2 ${
        current ? 'bg-surface-sunken shadow-[inset_2px_0_0_var(--ink)]' : 'hover:bg-surface-sunken'
      }`}
    >
      {/* A source that is not ready is not used, so its box is empty. Ticked and
          greyed out would say the opposite: that a file which could not be read
          is in the answer anyway. */}
      <input
        type="checkbox"
        className="mt-px h-[15px] w-[15px] cursor-pointer accent-[var(--ink)]"
        checked={usable && selected}
        disabled={!usable}
        onChange={(event) => onSelectedChange(event.target.checked)}
        aria-label={`Use ${source.title}`}
      />

      <Icon name={ICON_FOR[source.kind]} className="mt-px text-ink-faint" />

      <button
        type="button"
        disabled={!usable}
        onClick={() => onOpen?.(source.id)}
        className="min-w-0 cursor-pointer text-left disabled:cursor-default"
      >
        <span
          className={`line-clamp-2 text-ui leading-[1.35] ${
            source.status === 'failed' ? 'text-ink-muted' : ''
          }`}
        >
          {source.title}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-micro text-ink-faint tabular-nums">
          <span
            data-testid={`dot-${source.id}`}
            data-state={source.status}
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(source)}`}
            aria-hidden="true"
          />
          {metaFor(source)}
        </span>
      </button>
    </div>
  );
}
