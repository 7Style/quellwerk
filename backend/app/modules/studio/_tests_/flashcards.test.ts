/**
 * Karten aus einem Segmentstrom schneiden, ohne einen Beleg zu verlieren.
 *
 * Das ist der einzige Ort in diesem Repository, an dem Text zerlegt wird, den
 * ein Modell geschrieben hat. Er ist es wert, genau geprüft zu werden: ein
 * Beleg, der bei der falschen Karte landet, ist schlimmer als einer, der fehlt
 * - er behauptet etwas über eine Stelle, die etwas anderes sagt.
 */
import { describe, expect, it } from '@jest/globals';

import { MAX_CARDS, splitCards, type CardCitation, type CardSegment } from '../internal/flashcards.js';

function cite(text: string, start = 100): CardCitation {
  return {
    sourceId: '00000000-0000-4000-8000-000000000001',
    sourceTitle: 'Verordnung',
    start,
    end: start + text.length,
    text,
    page: 12,
  };
}

/** Wie die Antwort aus dem Resolver kommt: Text, und Belege am Segmentende. */
const TWO_CARDS: CardSegment[] = [
  {
    text: 'Q: Was verlangt Artikel 9?\nA: Ein Risikomanagementsystem, das eingerichtet und aufrechterhalten wird',
    citations: [cite('eingerichtet, angewendet, dokumentiert und aufrechterhalten')],
  },
  {
    text: '.\n\nQ: Ab wann gilt die Verordnung?\nA: Sie gilt ab dem 2. August 2026',
    citations: [cite('Sie gilt ab dem 2. August 2026.', 81_379)],
  },
  { text: '.', citations: [] },
];

describe('cutting an answer into cards', () => {
  it('finds the cards and their questions', () => {
    const cards = splitCards(TWO_CARDS);

    expect(cards.map((card) => card.question)).toEqual([
      'Was verlangt Artikel 9?',
      'Ab wann gilt die Verordnung?',
    ]);
  });

  it('leaves every citation on the card it stood in', () => {
    const cards = splitCards(TWO_CARDS);

    expect(cards[0].answer.flatMap((one) => one.citations).map((one) => one.start)).toEqual([100]);
    expect(cards[1].answer.flatMap((one) => one.citations).map((one) => one.start)).toEqual([
      81_379,
    ]);
  });

  it('keeps the answer as segments, so the chips sit where they sat', () => {
    const [first] = splitCards(TWO_CARDS);

    expect(first.answer[0].text).toContain('Ein Risikomanagementsystem');
    expect(first.answer[0].citations).toHaveLength(1);
  });

  it('drops a question without an answer', () => {
    const cards = splitCards([{ text: 'Q: Eine Frage ohne alles\n\nQ: Zweite\nA: Hat eine.', citations: [] }]);

    expect(cards.map((card) => card.question)).toEqual(['Zweite']);
  });

  it('drops anything outside a card', () => {
    // Der Prompt verbietet Vorspann und Schlusswort. Kommt doch welcher, faellt
    // er weg, statt als Karte ohne Frage auf dem Stapel zu liegen.
    const cards = splitCards([
      {
        text: 'Hier sind die Karten:\n\nQ: Die Frage\nA: Die Antwort.\n\nDas war es.',
        citations: [],
      },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].answer.map((one) => one.text).join('')).toBe('Die Antwort.');
  });

  it('joins a two-line answer with a space and not with a paragraph', () => {
    const cards = splitCards([
      { text: 'Q: Frage\nA: Erste Zeile\nzweite Zeile.', citations: [] },
    ]);

    expect(cards[0].answer.map((one) => one.text).join('')).toBe('Erste Zeile zweite Zeile.');
  });

  it('moves a citation on the question line to the answer of that card', () => {
    // Der Resolver haengt einen Beleg ans Ende seines Segments; endet das auf
    // der Fragezeile, gehoert er trotzdem zu dieser Karte.
    const cards = splitCards([
      { text: 'Q: Was verlangt Artikel 9?', citations: [cite('Artikel 9')] },
      { text: '\nA: Ein Risikomanagementsystem.', citations: [] },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].answer.flatMap((one) => one.citations)).toHaveLength(1);
  });

  it('stops at twenty cards', () => {
    const many = Array.from(
      { length: 30 },
      (_, index) => `Q: Frage ${index}\nA: Antwort ${index}.`
    ).join('\n\n');

    expect(splitCards([{ text: many, citations: [] }])).toHaveLength(MAX_CARDS);
  });

  it('starts a card even when the block boundary ate the newline', () => {
    // Aus dem dritten echten Lauf, woertlich: die Citations API schneidet an
    // den Belegen, und dabei kann der Umbruch zwischen Frage und Antwort
    // verschwinden. Zeilenweise zusammengesetzt klebte die Antwort an der
    // Frage, und der Stapel kam leer zurueck.
    const cards = splitCards([
      { text: 'Q: Ab wann gilt die KI-Verordnung nach ihrem Artikel 113?', citations: [] },
      { text: 'A: Sie tritt am zwanzigsten Tag nach ihrer Veroeffentlichung in Kraft', citations: [cite('x')] },
      { text: ' und gilt ab dem 2. August 2026.', citations: [] },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].question).toBe('Ab wann gilt die KI-Verordnung nach ihrem Artikel 113?');
    expect(cards[0].answer.map((one) => one.text).join('')).toContain('zwanzigsten Tag');
    expect(cards[0].answer.flatMap((one) => one.citations)).toHaveLength(1);
  });

  it('survives a blank line between the question and its answer', () => {
    // Aus dem vierten echten Lauf: dasselbe Modell schreibt die Karte mal als
    // `Q:\nA:` und mal als `Q:\n\nA:`. Mit der einfachen Regel "Leerzeile
    // beendet die Karte" starb jede Karte, bevor sie eine Antwort hatte.
    const cards = splitCards([
      { text: 'Q: Ab wann gilt die KI-Verordnung allgemein?\n\nA: ', citations: [] },
      { text: 'Sie gilt ab dem 2. August 2026.', citations: [cite('x')] },
      { text: '\n\nQ: Und die Governance-Bestimmungen?\n\nA: ', citations: [] },
      { text: 'Ab dem 2. August 2025.', citations: [cite('y')] },
    ]);

    expect(cards.map((card) => card.question)).toEqual([
      'Ab wann gilt die KI-Verordnung allgemein?',
      'Und die Governance-Bestimmungen?',
    ]);
    expect(cards[0].answer.flatMap((one) => one.citations)).toHaveLength(1);
    expect(cards[1].answer.flatMap((one) => one.citations)).toHaveLength(1);
  });

  it('takes the marker a German answer translates it into', () => {
    // Der erste echte Lauf hat null Karten ergeben: die Karten sind deutsch,
    // und das Modell hat den Marker mituebersetzt. Der Prompt sagt jetzt, dass
    // die Marker Marken sind; der Schnitt nimmt die Uebersetzung trotzdem an.
    const cards = splitCards([
      { text: 'F: Was verlangt Artikel 9?\nA: Ein Risikomanagementsystem.', citations: [] },
      { text: '\n\nFrage: Ab wann?\nAntwort: Ab dem 2. August 2026.', citations: [] },
    ]);

    expect(cards.map((card) => card.question)).toEqual(['Was verlangt Artikel 9?', 'Ab wann?']);
  });

  it('takes a marker in bold or behind a list dash', () => {
    const cards = splitCards([
      { text: '- **Q:** Erste Frage\n- **A:** Erste Antwort.', citations: [] },
      { text: '\n\n1. Q: Zweite Frage\n2. A: Zweite Antwort.', citations: [] },
    ]);

    expect(cards.map((card) => card.question)).toEqual(['Erste Frage', 'Zweite Frage']);
  });

  it('does not guess: a line that is merely a question is not a card', () => {
    // "Finde die Fragen" waere Raten, und an einer Stelle, an der Belege
    // haengen, wird nicht geraten.
    const cards = splitCards([
      { text: 'Was verlangt Artikel 9?\nEin Risikomanagementsystem.', citations: [] },
    ]);

    expect(cards).toEqual([]);
  });

  it('returns nothing for an answer that has no cards in it', () => {
    // Dann meldet der Job einen Fehlschlag mit einem Satz, statt einen leeren
    // Stapel abzulegen, den jemand durchblaettert.
    expect(splitCards([{ text: 'Ich kann dazu nichts sagen.', citations: [] }])).toEqual([]);
  });
});
