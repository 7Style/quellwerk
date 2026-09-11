/**
 * Answers from a recorded file instead of from a model.
 *
 * This is what makes `pnpm eval --smoke` run in CI: no key, no cost, no
 * network, and the same numbers on every machine. What it measures is the
 * harness, not the product; the report says so on every line it prints, because
 * a citation-validity of 100 percent against fixtures means only that the
 * checker works.
 *
 * A fixture is deliberately dumb: text, citations with absolute offsets, and
 * nothing else. The offsets are absolute on purpose. If `normalize` or the
 * corpus ever changes, every fixture breaks at once and loudly, which is the
 * regression we want to be told about rather than to discover in a highlight
 * three milestones later.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { EVALS_DIR, type GoldenItem } from '../golden.js';
import type { Answerer, EvalAnswer } from './types.js';

export const FIXTURES_DIR = path.join(EVALS_DIR, 'fixtures');

const fixtureSchema = z.object({
  id: z.string(),
  /** Which answerer produced this, and when. Provenance, not decoration. */
  recordedBy: z.string(),
  recordedAt: z.string(),
  text: z.string(),
  citations: z.array(
    z.object({
      file: z.string(),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      citedText: z.string(),
    })
  ),
  /** Why this fixture exists, when it is not obvious. For humans. */
  note: z.string().optional(),
});

export type Fixture = z.infer<typeof fixtureSchema>;

export class FixtureMissingError extends Error {
  constructor(readonly itemId: string) {
    super(`no fixture for ${itemId}; record one or run a mode that calls a model`);
    this.name = 'FixtureMissingError';
  }
}

export class FixtureAnswerer implements Answerer {
  readonly name = 'fixture';
  readonly callsModel = false;

  constructor(private readonly dir: string = FIXTURES_DIR) {}

  async answer(item: GoldenItem): Promise<EvalAnswer> {
    const file = path.join(this.dir, `${item.id}.json`);

    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      throw new FixtureMissingError(item.id);
    }

    const fixture = fixtureSchema.parse(JSON.parse(raw));
    if (fixture.id !== item.id) {
      throw new Error(`fixture ${path.basename(file)} carries id ${fixture.id}`);
    }

    return { text: fixture.text, citations: fixture.citations, latencyMs: 0 };
  }
}

/** Which golden items have a fixture. The smoke subset is exactly this set. */
export async function recordedIds(dir: string = FIXTURES_DIR): Promise<Set<string>> {
  const { readdir } = await import('node:fs/promises');
  try {
    const entries = await readdir(dir);
    return new Set(
      entries.filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''))
    );
  } catch {
    return new Set();
  }
}
