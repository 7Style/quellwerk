import type { ReactNode } from 'react';

import { Icon } from '@/components/icon';

export type BannerTone = 'neutral' | 'danger' | 'notice';

export interface BannerProps {
  tone?: BannerTone;
  title: string;
  children: ReactNode;
  /** A way out of the state, when there is one. */
  action?: ReactNode;
}

/**
 * The one shape every message about a state takes.
 *
 * An error says what happened and what to do next; it does not apologise and it
 * never shows a stack trace (design/states.html). The tone is the difference
 * between something that went wrong, something that is a limit, and something
 * that is merely worth knowing.
 */
export function Banner({ tone = 'neutral', title, children, action }: BannerProps) {
  const skin =
    tone === 'danger'
      ? 'border-danger bg-danger-wash'
      : tone === 'notice'
        ? 'border-notice bg-notice-wash'
        : 'border-rule-strong bg-surface';

  const iconColour =
    tone === 'danger' ? 'text-danger' : tone === 'notice' ? 'text-notice' : 'text-ink-muted';

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-testid="banner"
      data-tone={tone}
      className={`flex items-start gap-3 rounded-control border px-4 py-3 text-ui-lg ${skin}`}
    >
      <Icon name="warning" className={`mt-0.5 ${iconColour}`} />
      <span>
        <span className="mb-0.5 block font-semibold">{title}</span>
        <span className="block text-ui text-ink-muted">{children}</span>
      </span>
      {action ? (
        <>
          <span className="flex-1" />
          {action}
        </>
      ) : null}
    </div>
  );
}
