/**
 * The shape of one golden-set line, and the reader for the file.
 *
 * The file itself is written by hand (ADR-0008, enforced by a hook): a harness
 * that generates its own questions grades its own homework. Drafts go to
 * evals/golden.draft.jsonl and are copied over by a human.
 *
 * JSONL rather than JSON: a diff shows one changed question as one changed
 * line, and a line can be moved between the splits without touching the rest.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

export const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN_FILE = path.join(EVALS_DIR, 'golden.jsonl');

/**
 * The item types come from the grounding contract in docs/SPEC.md. Each one
 * exists because it can fail in its own way:
 *   grounded      one source answers; the ordinary case
 *   multi_source  complementary sources, the answer has to join them
 *   conflict      the sources disagree; naming the disagreement is the answer
 *   injection     a source addresses an assistant; it is reported, not obeyed
 *   unanswerable  the sources do not cover it; the refusal sentence is the answer
 */
export const ITEM_TYPES = [
  'grounded',
  'multi_source',
  'conflict',
  'injection',
  'unanswerable',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const evidenceSchema = z.object({
  /** File name as it stands in corpus/manifest.json. */
  file: z.string().min(1),
  /**
   * A passage that stands verbatim in the NORMALISED text of that file. Short
   * enough to be one passage, long enough to occur only once.
   */
  quote: z.string().min(12),
});

export const itemSchema = z.object({
  /** Stable for the life of the set. Renumbering breaks every recorded result. */
  id: z.string().regex(/^g\d{2}$/),
  split: z.enum(['dev', 'heldout']),
  type: z.enum(ITEM_TYPES),
  lang: z.enum(['de', 'en']),
  // 4000 is the cap of the chat route's zod schema (docs/SPEC.md, "Zahlen"). A
  // golden question longer than a question the product accepts would measure
  // something the product cannot be asked.
  question: z.string().min(8).max(4000),
  /** Empty exactly for `unanswerable`. */
  evidence: z.array(evidenceSchema),
  /** What a correct answer has to contain; the correctness judge grades against these. */
  facts: z.array(z.string().min(3)),
  /** Why this item is in the set. For humans, never sent to a model. */
  note: z.string().optional(),
});

export type GoldenItem = z.infer<typeof itemSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export interface GoldenParseResult {
  items: GoldenItem[];
  /** One entry per line that could not be read, with the line number. */
  problems: string[];
}

/**
 * Reads a JSONL golden set. Blank lines and `//` lines are skipped so the file
 * can carry a header comment without a second format.
 */
export async function loadGolden(file: string = GOLDEN_FILE): Promise<GoldenParseResult> {
  const raw = await readFile(file, 'utf8');
  const items: GoldenItem[] = [];
  const problems: string[] = [];

  for (const [index, line] of raw.split('\n').entries()) {
    const text = line.trim();
    if (text === '' || text.startsWith('//')) continue;

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      problems.push(`line ${index + 1}: not valid JSON (${(error as Error).message})`);
      continue;
    }

    const parsed = itemSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      problems.push(
        `line ${index + 1}: ${first?.path.join('.') || 'item'}: ${first?.message ?? 'invalid'}`
      );
      continue;
    }
    items.push(parsed.data);
  }

  return { items, problems };
}

export function devSplit(items: GoldenItem[]): GoldenItem[] {
  return items.filter((item) => item.split === 'dev');
}

export function heldoutSplit(items: GoldenItem[]): GoldenItem[] {
  return items.filter((item) => item.split === 'heldout');
}
