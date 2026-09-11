/**
 * Reads the corpus files the demo notebook is built from.
 *
 * `backend/evals/corpus/` is the one tree: the golden set quotes it, the demo
 * notebook shows it, and the image carries it so the seed can run inside the
 * container. Copying the four files to a second place would give the demo and
 * the evals different text within a week.
 */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SourceKind } from '../../app/modules/sources/internal/extract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Found by walking up, not by counting `..`.
 *
 * The depth differs: in a checkout this file sits at
 * backend/prisma/seed-data and the corpus two levels up; compiled it sits at
 * /usr/src/app/dist/prisma/seed-data and the corpus three levels up, because
 * dist adds a level. A fixed number of `..` is right in exactly one of the two,
 * and the wrong one fails inside the container where nobody is watching.
 */
async function findCorpusDir(): Promise<string> {
  const searched: string[] = [];
  let current = HERE;

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(current, 'evals', 'corpus');
    searched.push(candidate);
    try {
      await access(path.join(candidate, 'manifest.json'));
      return candidate;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new Error(`corpus not found; looked in ${searched.join(', ')}`);
}

interface ManifestEntry {
  file: string;
  kind: SourceKind;
  title: string;
  source?: string;
}

export interface CorpusEntry extends ManifestEntry {
  /** A Buffer for a PDF, a string for the text formats; `extract` takes both. */
  data: Buffer | string;
}

export async function loadCorpusFiles(dirOverride?: string): Promise<CorpusEntry[]> {
  const dir = dirOverride ?? (await findCorpusDir());
  const manifest = JSON.parse(
    await readFile(path.join(dir, 'manifest.json'), 'utf8')
  ) as ManifestEntry[];

  const entries: CorpusEntry[] = [];
  for (const entry of manifest) {
    const full = path.join(dir, entry.file);
    const data =
      entry.kind === 'pdf' || entry.kind === 'docx'
        ? await readFile(full)
        : await readFile(full, 'utf8');
    entries.push({ ...entry, data });
  }
  return entries;
}
