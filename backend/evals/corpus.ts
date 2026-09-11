/**
 * Loads the eval corpus the same way the application loads a source.
 *
 * This file deliberately imports `extract` from the sources module instead of
 * doing its own reading. The golden set quotes character ranges out of the
 * stored text; if the harness normalised differently from the ingest, every
 * quote would be measured against a string that never exists in production and
 * the whole eval would be theatre. One function, one text (ADR-0003).
 *
 * The same four files become the demo notebook in M2-T5. One tree of files, not
 * two with the same text in them.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extract, type SourceKind } from '../app/modules/sources/internal/extract.js';
import type { PageSpan } from '../app/modules/sources/internal/pages.js';

export const CORPUS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus');

/** One entry of corpus/manifest.json. */
export interface CorpusManifestEntry {
  file: string;
  kind: SourceKind;
  title: string;
  /** Where the file came from; absent for the two written by hand. */
  source?: string;
}

export interface CorpusFile extends CorpusManifestEntry {
  /** Normalised text, byte for byte what a citation would point into. */
  text: string;
  pages: PageSpan[];
}

export async function readManifest(): Promise<CorpusManifestEntry[]> {
  const raw = await readFile(path.join(CORPUS_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as CorpusManifestEntry[];
}

/**
 * Reads and extracts every file in the manifest, in manifest order. That order
 * is the source `position` later, and `document_index` in a citation follows it.
 */
export async function loadCorpus(): Promise<CorpusFile[]> {
  const manifest = await readManifest();
  const files: CorpusFile[] = [];

  for (const entry of manifest) {
    const full = path.join(CORPUS_DIR, entry.file);
    // Text formats are read as utf8 and binary ones as a Buffer; `extract`
    // accepts both, but handing a PDF over as a string would corrupt it.
    const input =
      entry.kind === 'pdf' || entry.kind === 'docx'
        ? await readFile(full)
        : await readFile(full, 'utf8');
    const { text, pages } = await extract(entry.kind, input);
    files.push({ ...entry, text, pages });
  }

  return files;
}

/** Lookup by file name, the key the golden set uses to point at a corpus file. */
export function byFile(corpus: CorpusFile[]): Map<string, CorpusFile> {
  return new Map(corpus.map((file) => [file.file, file]));
}
