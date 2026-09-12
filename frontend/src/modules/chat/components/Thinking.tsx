export interface ThinkingProps {
  /** How many sources the turn is reading. Named, because it is the wait's reason. */
  sourceCount: number;
}

/**
 * The wait before the first token.
 *
 * It names what is happening rather than spinning silently: reading three
 * sources takes as long as it takes, and a reader who knows why is not a reader
 * who reloads.
 */
export function Thinking({ sourceCount }: ThinkingProps) {
  return (
    <span className="inline-flex items-center gap-2 text-ui text-ink-muted" data-testid="thinking">
      <span
        aria-hidden="true"
        className="h-[14px] w-[14px] shrink-0 rounded-full border-[1.5px] border-rule-strong border-t-ink-muted motion-safe:animate-[qw-spin_700ms_linear_infinite]"
      />
      <span role="status">
        Reading {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
      </span>
    </span>
  );
}
