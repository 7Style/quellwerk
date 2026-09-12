import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told this project's scales, or it merges the wrong
 * classes away.
 *
 * It decides which of two utilities wins by putting them in a group, and it
 * knows the groups of stock Tailwind only. Every scale in styles/global.css is
 * named rather than numbered, so `text-ink-inverse` (a colour) and `text-ui-lg`
 * (a size) look alike to it: it kept the later one and dropped the other. The
 * first thing that hit was the primary button, which rendered as a black
 * rectangle with black text on it - the colour had been merged away by the size.
 *
 * The lists below are the `--text-*`, `--leading-*`, `--radius-*` and `--font-*`
 * names from global.css. A scale that gains a step there gains it here, and a
 * missing entry is not a crash: it is two classes that both survive and a
 * stylesheet order deciding which one applies.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['micro', 'small', 'ui', 'ui-lg', 'read', 'h3', 'h2', 'h1', 'display'] },
      ],
      leading: [{ leading: ['tight', 'ui', 'read'] }],
      rounded: [{ rounded: ['chip', 'control', 'surface'] }],
      'font-family': [{ font: ['ui', 'read', 'mono'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
