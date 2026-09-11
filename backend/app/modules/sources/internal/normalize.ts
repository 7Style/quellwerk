/**
 * Source text is normalised exactly once, at ingest, and never touched again
 * (ADR-0003). The string this function returns is what goes to the model, what
 * the viewer renders, and what a citation's character offsets point into. Those
 * three must be the same string, so every change here invalidates every stored
 * offset.
 *
 * The one property everything else rests on: normalising twice changes nothing.
 * Every rule below is written to be idempotent, and a test asserts it on real
 * corpus files rather than on a happy-path string.
 */

/**
 * Characters that carry no meaning but shift every offset behind them:
 * zero-width space, zero-width non-joiner, zero-width joiner, word joiner and
 * the byte order mark.
 *
 * Written as escapes on purpose: as literals nobody can see what stands there,
 * which makes the line impossible to review and easy to break by accident.
 *
 * An alternation, not a character class. The zero-width joiner inside a class
 * can bind to its neighbours and change what the class matches, which ESLint
 * flags as misleading and which would be a silent bug in a function whose whole
 * job is to not change the text unpredictably.
 */
const INVISIBLE = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;

/** Soft hyphen: PDFs are full of them, and they break every quoted word. */
const SOFT_HYPHEN = /\u00AD/g;

/**
 * Non-breaking, en, em, thin and ideographic spaces become the ordinary one.
 * A quote that differs from its source only by the width of a space would fail
 * the citation check, be dropped, and the reader would never learn why.
 */
const EXOTIC_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Trailing spaces and tabs at the end of a line. */
const TRAILING_WS = /[ \t]+$/gm;

/** Three or more newlines collapse to exactly two: one blank line. */
const EXCESS_BLANK_LINES = /\n{3,}/g;

/**
 * Normalises a source text.
 *
 * Deliberately NOT done here:
 *   - NFKC. It would turn a superscript two into a plain 2 and the fi ligature
 *     into two letters, which changes what the document says about itself. NFC
 *     composes accents without rewriting characters, and that is the line
 *     between tidying and editing.
 *   - Lowercasing, joining words split across line breaks, merging paragraphs.
 *     All of them would make quotes prettier and offsets wrong.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(SOFT_HYPHEN, '')
    .replace(EXOTIC_SPACE, ' ')
    .replace(TRAILING_WS, '')
    .replace(EXCESS_BLANK_LINES, '\n\n')
    .trim();
}

/**
 * True when the text is already in normal form. The page map uses it to assert
 * its own output rather than to hope for it.
 */
export function isNormalized(text: string): boolean {
  return normalize(text) === text;
}
