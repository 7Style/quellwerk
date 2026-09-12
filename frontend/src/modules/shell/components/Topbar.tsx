import Link from 'next/link';
import type { ReactNode } from 'react';

import { ThemeToggle } from './ThemeToggle';

export interface TopbarProps {
  /** The middle of the bar. Home leaves it empty, a notebook puts its name here. */
  children?: ReactNode;
  /** Right of the middle and left of the theme toggle: "Saved 2 minutes ago". */
  meta?: ReactNode;
}

/**
 * The bar above everything, 56px, on both routes.
 *
 * It is a server component apart from the theme toggle. The wordmark is a link
 * home from every page including home itself, which is what a wordmark is for.
 */
export function Topbar({ children, meta }: TopbarProps) {
  return (
    <header className="flex h-[var(--topbar-h)] flex-none items-center gap-3 border-b border-rule bg-surface px-4">
      <Link
        href="/"
        className="text-ui-lg font-semibold tracking-[0.01em] whitespace-nowrap text-ink no-underline"
      >
        Quellwerk
      </Link>

      {/* min-w-0 so a long notebook title truncates instead of pushing the
          toggle off the bar. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>

      {meta ? (
        <span className="text-small whitespace-nowrap text-ink-faint tabular-nums">{meta}</span>
      ) : null}
      <ThemeToggle />
    </header>
  );
}
