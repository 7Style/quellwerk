/**
 * Loads a prompt from prompts/ at runtime and renders it. Nothing that goes to
 * a model is inlined in TypeScript (CLAUDE.md); the "View prompt used" menu
 * shows the rendered file, so a reviewer reads the real prompt.
 *
 * The renderer and its contract live in render.ts and prompts/README.md.
 */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, type RenderValues } from './render.js';

/**
 * Front matter is documentation for humans and for the request builders: which
 * route a file belongs to, which model it runs on, whether citations are on.
 * The loader strips it, so none of it ever reaches the model.
 */
export interface PromptMeta {
  route?: string;
  /** The env variable name, not a model id. Resolved in config/models.ts. */
  model?: string;
  effort?: string;
  citations?: boolean;
  output?: 'text' | 'json';
  /** `frozen` means the body must stay byte-identical: it is a cached prefix. */
  cache?: string;
}

export interface LoadedPrompt {
  name: string;
  meta: PromptMeta;
  /** The prompt text with the front matter removed. */
  body: string;
}

export class PromptNotFoundError extends Error {
  constructor(name: string, searched: string[]) {
    super(`prompt "${name}" not found; looked in ${searched.join(', ')}`);
    this.name = 'PromptNotFoundError';
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The prompts directory, found by walking up from this file.
 *
 * Not resolved from `process.cwd()`, which is whatever directory a command
 * happened to start in, and not by a fixed number of `..`: the depth differs
 * between the source tree (backend/app/services/prompt-loader) and the compiled
 * one inside the image (/usr/src/app/dist/app/services/prompt-loader, with
 * prompts at /usr/src/prompts). Walking up until `prompts/README.md` appears is
 * true in both and fails with the list of places it looked.
 */
let promptsDirPromise: Promise<string> | null = null;

async function findPromptsDir(): Promise<string> {
  const searched: string[] = [];
  let current = HERE;

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(current, 'prompts');
    searched.push(candidate);
    try {
      await access(path.join(candidate, 'README.md'));
      return candidate;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new PromptNotFoundError('prompts/', searched);
}

export function promptsDir(): Promise<string> {
  promptsDirPromise ??= findPromptsDir();
  return promptsDirPromise;
}

/**
 * Minimal front matter reader: `key: value` lines between two `---` fences.
 *
 * Deliberately not a YAML parser. The block is documentation with six known
 * keys, and a dependency that can parse anchors and nested maps would invite
 * someone to put logic in there.
 */
function splitFrontMatter(raw: string): { meta: PromptMeta; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };

  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw };

  const block = raw.slice(raw.indexOf('\n') + 1, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const meta: PromptMeta = {};

  for (const line of block.split('\n')) {
    const withoutComment = line.replace(/\s+#.*$/, '').trim();
    if (withoutComment === '') continue;
    const separator = withoutComment.indexOf(':');
    if (separator === -1) continue;

    const key = withoutComment.slice(0, separator).trim();
    const value = withoutComment.slice(separator + 1).trim();
    // Six known keys; anything else in the block is documentation for a human
    // and is dropped rather than carried into a type that does not have it.
    (meta as Record<string, unknown>)[key] =
      value === 'true' ? true : value === 'false' ? false : value;
  }

  return { meta, body };
}

/**
 * Prompts are read once and kept. They cannot change while the process runs:
 * they are baked into the image, and one of them is a frozen cache prefix that
 * must stay byte-identical between requests.
 */
const cache = new Map<string, LoadedPrompt>();

export async function loadPrompt(name: string): Promise<LoadedPrompt> {
  const cached = cache.get(name);
  if (cached) return cached;

  const dir = await promptsDir();
  const file = path.join(dir, `${name}.md`);

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new PromptNotFoundError(name, [file]);
  }

  const { meta, body } = splitFrontMatter(raw);
  const loaded: LoadedPrompt = { name, meta, body };
  cache.set(name, loaded);
  return loaded;
}

/** Loads and renders in one step, which is what every caller actually wants. */
export async function renderPrompt(name: string, values: RenderValues = {}): Promise<string> {
  const { body } = await loadPrompt(name);
  return render(body, values);
}

/** Only for tests: forgets what was read, so a fixture directory can be swapped. */
export function clearPromptCache(): void {
  cache.clear();
  promptsDirPromise = null;
}

export { render } from './render.js';
export type { RenderValues, RenderValue } from './render.js';
export { MissingPromptValueError, UnrenderedPlaceholderError } from './render.js';
