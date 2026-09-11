import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { isNormalized, normalize } from '../normalize.js';

const CORPUS = join(import.meta.dirname, '../../../../../evals/corpus');

describe('normalize', () => {
  it('is idempotent: normalising twice changes nothing', () => {
    const nasty = [
      'Zeile mit Leerzeichen am Ende   ',
      'Windows\r\nund alter Mac\rZeilenende',
      'weiches­Trennzeichen',
      'geschütztes Leerzeichen und schmales Leerzeichen',
      'unsichtbar​mittendrin﻿',
      'drei\n\n\n\nLeerzeilen',
      '   rundherum   ',
    ].join('\n\n');

    const once = normalize(nasty);
    expect(normalize(once)).toBe(once);
    expect(isNormalized(once)).toBe(true);
  });

  it('is idempotent on the real corpus files', () => {
    for (const file of ['02-kommission-faq.md', '03-glossar.md', '04-interne-notiz.md']) {
      const raw = readFileSync(join(CORPUS, file), 'utf8');
      const once = normalize(raw);
      expect(normalize(once)).toBe(once);
    }
  });

  it('removes what shifts offsets without carrying meaning', () => {
    expect(normalize('weiches­Trenn')).toBe('weichesTrenn');
    expect(normalize('null​breite')).toBe('nullbreite');
    expect(normalize('﻿BOM am Anfang')).toBe('BOM am Anfang');
    expect(normalize('geschütztes Leerzeichen')).toBe('geschütztes Leerzeichen');
  });

  it('unifies line endings and collapses more than one blank line', () => {
    expect(normalize('a\r\nb\rc')).toBe('a\nb\nc');
    expect(normalize('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(normalize('a\n\nb')).toBe('a\n\nb');
  });

  it('strips trailing whitespace per line, and the whole text at both ends', () => {
    // Indentation inside the text survives; only the very start and end go.
    expect(normalize('  a   \n  b\t\n')).toBe('a\n  b');
    expect(normalize('a   \n   b')).toBe('a\n   b');
  });

  it('composes with NFC but does not rewrite characters the way NFKC would', () => {
    // e + combining acute becomes the composed character: same text, one form.
    expect(normalize('é')).toBe('é');
    // NFKC would turn these into "2" and "fi" and change what the document says.
    expect(normalize('m²')).toBe('m²');
    expect(normalize('ﬁnden')).toBe('ﬁnden');
  });
});
