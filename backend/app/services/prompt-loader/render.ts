/**
 * The template renderer. Its whole contract is prompts/README.md, and it is
 * deliberately too small to grow features.
 *
 * The rule it exists to enforce: source text, file names and everything a user
 * typed are data, not instructions. A value interpolated with `{{name}}` cannot
 * open or close a tag of the prompt, because the two characters that would do
 * that are replaced by their single-angle lookalikes. The reader still sees
 * what was written; the parser cannot be fooled by it.
 *
 * What it deliberately does NOT do: shorten, collapse whitespace, escape HTML,
 * or loop. Lengths belong to the zod schema of the route that accepted the
 * value (CLAUDE.md); a renderer that truncates would cut a quote in half and
 * nobody would know where.
 */

/** U+2039 and U+203A. They look like angle brackets and are not angle brackets. */
const SINGLE_ANGLE_LEFT = '‹';
const SINGLE_ANGLE_RIGHT = '›';

export type RenderValue = string | number | boolean | null | undefined;

export interface RenderValues {
  [key: string]: RenderValue;
}

export class MissingPromptValueError extends Error {
  constructor(readonly key: string) {
    super(`prompt value "${key}" is missing`);
    this.name = 'MissingPromptValueError';
  }
}

export class UnrenderedPlaceholderError extends Error {
  constructor(readonly remainder: string) {
    super(`prompt still contains a placeholder after rendering: ${remainder}`);
    this.name = 'UnrenderedPlaceholderError';
  }
}

function escapeAngles(value: string): string {
  return value.replaceAll('<', SINGLE_ANGLE_LEFT).replaceAll('>', SINGLE_ANGLE_RIGHT);
}

function asString(value: RenderValue): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : String(value);
}

/**
 * Finds a `{{...}}` in the TEMPLATE that none of the three patterns above can
 * consume: a misspelled block, a name with a space or a hyphen in it, an
 * unclosed brace.
 *
 * Deliberately not a check on the rendered output, which is where this used to
 * sit. The output contains the user's question by then, so a question with a
 * "{{" in it threw an error carrying its own text - into the exception message,
 * into `logger.error`, and from there into a log file that SECURITY.md 7.5 says
 * never holds a question. It also failed a turn that was perfectly fine. The
 * template is written in this repository and contains no user data, so looking
 * there answers the same question and cannot leak anything.
 */
function findMalformedPlaceholder(template: string): string | null {
  const valid =
    /\{\{#if\s+[A-Za-z_][A-Za-z0-9_]*\}\}|\{\{\/if\}\}|\{\{\{[A-Za-z_][A-Za-z0-9_]*\}\}\}|\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/y;

  for (let index = template.indexOf('{{'); index !== -1; index = template.indexOf('{{', index + 2)) {
    valid.lastIndex = index;
    if (!valid.test(template)) return template.slice(index, index + 40);
  }
  return null;
}

/**
 * Renders a template.
 *
 * Order matters and is not an implementation detail:
 *
 *   1. `{{#if}}` blocks, so a placeholder inside a block that is dropped is
 *      never asked for. An optional section must not require its values.
 *   2. `{{{raw}}}`, before `{{escaped}}`, or the two inner braces of a triple
 *      would be eaten by the double-brace pattern.
 *   3. `{{escaped}}`.
 *   4. A check on the template for a placeholder none of the three patterns can
 *      consume. A prompt that reaches a model with `{{` still in it is a prompt
 *      nobody rendered, and the model would answer about the placeholder.
 */
export function render(template: string, values: RenderValues = {}): string {
  let output = template.replace(
    /\{\{#if\s+([A-Za-z_][A-Za-z0-9_]*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, block: string) => {
      const value = values[key];
      // Absent, null, empty string, 0 and false all drop the block. An empty
      // string is the case that matters: "no custom instructions" arrives as
      // one, and a block introducing instructions that are not there reads as
      // if the user said nothing on purpose.
      return value === undefined || value === null || value === '' || value === false || value === 0
        ? ''
        : block;
    }
  );

  output = output.replace(/\{\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}\}/g, (_match, key: string) => {
    const value = asString(values[key]);
    if (value === null) throw new MissingPromptValueError(key);
    // Raw. Allowed only for content that lives in this repository, which today
    // means the report structure blocks and nothing else (prompts/README.md).
    return value;
  });

  output = output.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_match, key: string) => {
    const value = asString(values[key]);
    if (value === null) throw new MissingPromptValueError(key);
    return escapeAngles(value);
  });

  const malformed = findMalformedPlaceholder(template);
  if (malformed) throw new UnrenderedPlaceholderError(malformed);

  return output;
}
