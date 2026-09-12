/**
 * The prototype's icon set, ported from design/app.js.
 *
 * It lives under components/ and not in a module because several modules draw
 * the same icons, and a module may not import from another module
 * (frontend/eslint.config.mjs). The paths are copied verbatim from the design
 * reference: a shape that changes there changes here under the same name.
 *
 * lucide-react is a dependency and would have been the obvious choice. These are
 * not lucide icons: they are drawn on a 16 unit grid at 1.5 stroke to sit on the
 * 13px UI type, and swapping them for a library set would change the look of
 * every panel head. The set is twenty-five paths, which is cheaper than the
 * tree-shaken import it would replace.
 */
import { cn } from '@/lib/utils';

const PATHS = {
  plus: <path d="M8 3.3v9.4M3.3 8h9.4" />,
  doc: (
    <>
      <path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6z" />
      <path d="M9 2v4h4" />
    </>
  ),
  web: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M2.6 8h10.8M8 2.4c1.4 1.5 2.2 3.5 2.2 5.6S9.4 12.1 8 13.6C6.6 12.1 5.8 10.1 5.8 8s.8-4.1 2.2-5.6z" />
    </>
  ),
  text: <path d="M3.4 4.2h9.2M3.4 8h9.2M3.4 11.8h6" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  send: <path d="M3 8.2l9.5-4.4-3.3 9.9-2-4.2z" />,
  stop: <rect x="4.5" y="4.5" width="7" height="7" rx="1" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 11h1" />
    </>
  ),
  download: <path d="M8 3v7.4M5.2 7.8L8 10.6l2.8-2.8M3.2 13h9.6" />,
  trash: <path d="M3.4 4.6h9.2M6.4 4.6V3.4h3.2v1.2M5 4.6l.6 8.2h4.8L11 4.6" />,
  sliders: (
    <>
      <path d="M3 5.2h6M11 5.2h2M3 10.8h2M7 10.8h6" />
      <circle cx="10" cy="5.2" r="1.4" />
      <circle cx="6" cy="10.8" r="1.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.6v1.4M8 13v1.4M2.9 2.9l1 1M12.1 12.1l1 1M1.6 8H3M13 8h1.4M2.9 13.1l1-1M12.1 3.9l1-1" />
    </>
  ),
  moon: <path d="M13 9.4A5.6 5.6 0 0 1 6.6 3a5.6 5.6 0 1 0 6.4 6.4z" />,
  chevronLeft: <path d="M9.8 3.6L5.4 8l4.4 4.4" />,
  chevronRight: <path d="M6.2 3.6L10.6 8l-4.4 4.4" />,
  chevronDown: <path d="M3.6 6.2L8 10.6l4.4-4.4" />,
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.2" />
      <path d="M10.4 10.4l3 3" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.6l5.6 10H2.4z" />
      <path d="M8 6.4v3M8 11.2v.1" />
    </>
  ),
  refresh: (
    <>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13.2 2.6v3h-3" />
    </>
  ),
  report: (
    <>
      <path d="M3.6 3h8.8v10H3.6z" />
      <path d="M5.8 5.8h4.4M5.8 8h4.4M5.8 10.2h2.6" />
    </>
  ),
  mindmap: (
    <>
      <circle cx="4" cy="8" r="1.6" />
      <circle cx="12" cy="4.4" r="1.6" />
      <circle cx="12" cy="11.6" r="1.6" />
      <path d="M5.5 7.3l5-2.2M5.5 8.7l5 2.2" />
    </>
  ),
  audio: <path d="M3 6.6v2.8M5.6 4.6v6.8M8.2 2.8v10.4M10.8 5.4v5.2M13.4 7v2" />,
  quote: (
    <>
      <path d="M4 3.4h8M4 6.4h8M4 9.4h5" />
      <path d="M2.2 3v7" />
    </>
  ),
  check: <path d="M3.4 8.4l3 3 6.2-6.8" />,
  external: (
    <>
      <path d="M12.6 9v3.1a1.4 1.4 0 0 1-1.4 1.4H3.9a1.4 1.4 0 0 1-1.4-1.4V4.8a1.4 1.4 0 0 1 1.4-1.4H7" />
      <path d="M9.8 2.6h3.6v3.6M13.4 2.6L7.8 8.2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  /** 20px instead of 16px, for the one place the prototype draws it larger. */
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * Always `aria-hidden`. Every icon in this interface sits next to a label or
 * inside a control that carries its own accessible name, so announcing the
 * graphic as well would read the button twice.
 */
export function Icon({ name, size = 'sm', className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'shrink-0 fill-none stroke-current',
        // Pixels: the numeric scale is the prototype's spacing, so `h-5` is 24px.
        size === 'lg' ? 'h-[20px] w-[20px]' : 'h-[16px] w-[16px]',
        className
      )}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
