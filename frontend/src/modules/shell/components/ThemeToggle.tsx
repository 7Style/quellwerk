'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { useTheme } from '../hooks';

/**
 * The one control in the topbar that has to be a client component.
 *
 * It renders the moon until the browser has told us what the page actually
 * shows. Server and first client render must agree or React replaces the tree,
 * and the resolved theme is only knowable in the browser; `useTheme` returns
 * 'light' on the server for exactly this reason.
 */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={toggleTheme}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      data-testid="theme-toggle"
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </Button>
  );
}
