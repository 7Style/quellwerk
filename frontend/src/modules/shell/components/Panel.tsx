import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';

export interface PanelProps {
  /** Which edge of the workspace it sits on. Decides which way the chevrons point. */
  side: 'left' | 'right';
  title: string;
  /** Shown next to the title and on the rail. Omitted when the panel counts nothing. */
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Pinned under the scroll area: "Add source". */
  footer?: ReactNode;
}

/**
 * One side column: a fixed head, a body that scrolls for itself, an optional
 * pinned foot, and a rail that replaces all three when the panel is collapsed.
 *
 * The body is the only part that scrolls, and it is the reason for `min-h-0` on
 * every flex parent up to the workspace. A flex child defaults to `min-height:
 * auto`, which means "as tall as my content"; without the override the column
 * grows past the viewport and the page scrolls instead of the panel.
 */
export function Panel({ side, title, count, collapsed, onToggle, children, footer }: PanelProps) {
  const label = `${collapsed ? 'Expand' : 'Collapse'} ${title.toLowerCase()}`;
  // Pointing outwards opens, pointing inwards closes.
  const closeIcon = side === 'left' ? 'chevronLeft' : 'chevronRight';
  const openIcon = side === 'left' ? 'chevronRight' : 'chevronLeft';

  const toggle = (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={label}
      data-testid={`toggle-${title.toLowerCase()}`}
    >
      <Icon name={collapsed ? openIcon : closeIcon} />
    </Button>
  );

  if (collapsed) {
    return (
      <aside
        data-collapsed="true"
        data-panel={title.toLowerCase()}
        className={`flex min-h-0 min-w-0 flex-col items-center gap-3 bg-surface pt-3 ${
          side === 'left' ? 'border-r border-rule' : 'border-l border-rule'
        }`}
      >
        {toggle}
        {/* Vertical, because 48px has room for a word only if it is turned. */}
        <span className="text-small font-semibold tracking-[0.02em] text-ink-muted [writing-mode:vertical-rl]">
          {title}
        </span>
        {count === undefined ? null : (
          <span className="text-micro text-ink-faint tabular-nums">{count}</span>
        )}
      </aside>
    );
  }

  return (
    <aside
      data-collapsed="false"
      data-panel={title.toLowerCase()}
      className={`flex min-h-0 min-w-0 flex-col bg-surface ${
        side === 'left' ? 'border-r border-rule' : 'border-l border-rule'
      }`}
    >
      <div className="flex h-[44px] flex-none items-center gap-2 border-b border-rule px-3">
        {side === 'right' ? toggle : null}
        <h2 className="m-0 text-ui-lg font-semibold">{title}</h2>
        {count === undefined ? null : (
          <span className="text-small text-ink-faint tabular-nums">{count}</span>
        )}
        <span className="flex-1" />
        {side === 'left' ? toggle : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid={`scroll-${title.toLowerCase()}`}
      >
        {children}
      </div>

      {footer ? <div className="flex-none border-t border-rule p-3">{footer}</div> : null}
    </aside>
  );
}
