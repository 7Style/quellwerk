/**
 * Loads a prompt from prompts/ at runtime and renders it. Nothing that goes to
 * a model is inlined in TypeScript (CLAUDE.md); the "View prompt used" menu
 * shows the rendered file, so a reviewer reads the real prompt.
 *
 * The renderer is deliberately tiny and its contract is prompts/README.md:
 * {{name}} escapes < and > to the single-angle characters, {{{name}}} renders
 * raw and is allowed only for content that lives in this repository,
 * {{#if name}}...{{/if}} keeps a block when the value is truthy.
 * Implementation arrives in M2-T2 with the first prompt that needs it.
 */
export interface RenderValues {
  [key: string]: string | number | boolean | null | undefined;
}

export function loadPrompt(_name: string): Promise<string> {
  throw new Error('prompt-loader.loadPrompt arrives in M2-T2');
}

export function render(_template: string, _values: RenderValues): string {
  throw new Error('prompt-loader.render arrives in M2-T2');
}
