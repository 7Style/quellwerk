/**
 * Karten aus einer Antwort schneiden, mit ihren Belegen.
 *
 * Flashcards gehen nicht über Structured Outputs, und das ist keine Bequem-
 * lichkeit: Belege und Structured Outputs schliessen einander im selben Aufruf
 * aus (CLAUDE.md, HTTP 400). Eine Karte ohne Beleg wäre in diesem Produkt eine
 * Behauptung - genau das, was es nicht baut. Also läuft der Aufruf wie ein
 * Report, mit Belegen und Text heraus, und die Karten werden danach aus dem
 * Segmentstrom geschnitten.
 *
 * Geschnitten wird an einer Form, die der Prompt fest vorgibt: `Q:` und `A:`,
 * je eine Zeile, Karten durch Leerzeilen getrennt. Das ist der eine Ort, an dem
 * dieses Repository Text zerlegt, den ein Modell geschrieben hat, und deshalb
 * ist die Regel so eng wie möglich - nicht "finde die Fragen", sondern "eine
 * Zeile, die mit Q: beginnt".
 *
 * Ein Beleg hängt am Ende seines Segments (Citations API), also gehört er zu
 * der Zeile, auf der sein Segment endet, und mit ihr zu genau einer Karte.
 */

/**
 * Ein geprüfter Beleg, wie der Resolver des Chat-Moduls ihn liefert.
 *
 * Lokal erklärt und nicht importiert: Module importieren einander nicht
 * (CLAUDE.md). Die Form ist `VerifiedCitation` und muss es bleiben - der Worker
 * reicht die Ausgabe des Resolvers hier hinein, und die Oberfläche zeichnet
 * einen Chip auf einer Karte wie einen in einer Antwort.
 */
export interface CardCitation {
  sourceId: string;
  sourceTitle: string;
  start: number;
  end: number;
  text: string;
  page: number | null;
}

export interface CardSegment {
  text: string;
  citations: CardCitation[];
}

export interface Flashcard {
  question: string;
  /** Die Rückseite, als Segmente: so zeichnet sie derselbe Renderer wie eine Antwort. */
  answer: CardSegment[];
}

/** Mehr Karten als das liest niemand durch, und jede kostet Ausgabe. */
export const MAX_CARDS = 20;

/**
 * Die Marker, und was ein Modell daraus macht, wenn man es laesst.
 *
 * Der Prompt verlangt `Q:` und `A:` woertlich und sagt, dass sie Marken sind
 * und keine Sprache. Trotzdem stehen hier die naheliegenden Abweichungen: die
 * Karten sind deutsch, und ein Modell, das deutschen Text schreibt, uebersetzt
 * einen Marker mit, wenn ihm niemand widerspricht - `F:` fuer Frage. Dazu die
 * zwei Arten, in denen Markdown dazwischenkommt: fette Marker und Listenpunkte.
 *
 * Weiter geht die Nachsicht nicht. "Finde die Fragen" waere Raten, und geraten
 * wird an einer Stelle, an der Belege haengen, nicht.
 */
const LIST = String.raw`(?:[-*]\s+|\d+[.)]\s+)?`;
const EMPHASIS = String.raw`\**`;
const QUESTION = new RegExp(`^${LIST}${EMPHASIS}(?:Q|F|Frage|Question)${EMPHASIS}\\s*[:.]${EMPHASIS}\\s*(.+)$`, 'i');
const ANSWER = new RegExp(`^${LIST}${EMPHASIS}(?:A|Antwort|Answer)${EMPHASIS}\\s*[:.]${EMPHASIS}\\s*(.*)$`, 'i');

/** Eine Zeile mit den Belegen, deren Segment auf ihr endet. */
interface Line {
  text: string;
  citations: CardCitation[];
}

/**
 * Ein Marker am Anfang eines Blocks beginnt eine Zeile, auch ohne Umbruch davor.
 *
 * Das ist der Fund aus dem dritten echten Lauf, und er ist der Grund, warum
 * diese Funktion nicht bloss `split('\n')` ist. Die Citations API schneidet den
 * Text an den Belegen in Bloecke, und dabei kann der Umbruch zwischen zwei
 * Zeilen verschwinden: gespeichert lagen "Q: Ab wann gilt die Verordnung?" und
 * "A: Sie tritt am zwanzigsten Tag..." als zwei Bloecke ohne ein `\n`
 * dazwischen. Zeilenweise zusammengesetzt wurde daraus eine Frage, deren
 * Antwort in derselben Zeile klebte - eine Karte ohne Antwort, und der ganze
 * Stapel leer.
 */
const MARKER = /^\s*\**(?:Q|F|Frage|Question|A|Antwort|Answer)\**\s*[:.]/i;

function toLines(segments: readonly CardSegment[]): Line[] {
  const lines: Line[] = [{ text: '', citations: [] }];

  for (const segment of segments) {
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      const startsCard = index === 0 && MARKER.test(part) && lines[lines.length - 1].text.length > 0;
      if (index > 0 || startsCard) lines.push({ text: '', citations: [] });
      lines[lines.length - 1].text += part;
    });
    // Die Belege des Segments enden dort, wo sein Text endet.
    lines[lines.length - 1].citations.push(...segment.citations);
  }

  return lines;
}

export function splitCards(segments: readonly CardSegment[]): Flashcard[] {
  const cards: Flashcard[] = [];
  let current: { question: string; lines: Line[] } | null = null;

  const close = (): void => {
    if (!current) return;

    const answer: CardSegment[] = [];
    for (const line of current.lines) {
      const text = line.text.trim();
      if (text.length === 0 && line.citations.length === 0) continue;
      answer.push({
        // Mehrere Zeilen einer Antwort mit einem Leerzeichen verbunden: es ist
        // ein Fliesstext, und ein Umbruch mitten in einer Karte ist kein
        // Absatz.
        text: answer.length > 0 ? ` ${text}` : text,
        citations: line.citations,
      });
    }

    // Eine Karte ohne Antwort ist eine Frage, und eine Frage ohne Antwort ist
    // keine Karte. Sie faellt weg, statt leer auf dem Stapel zu liegen.
    const hasText = answer.some((one) => one.text.trim().length > 0);
    if (hasText && cards.length < MAX_CARDS) {
      cards.push({ question: current.question, answer });
    }
    current = null;
  };

  for (const line of toLines(segments)) {
    const question = QUESTION.exec(line.text.trim());
    if (question) {
      close();
      current = { question: question[1].trim(), lines: [] };
      // Ein Beleg auf der Fragezeile gehoert zur Antwort dieser Karte: er
      // belegt, was die Karte sagt, und die Vorderseite sagt nichts.
      if (line.citations.length > 0) {
        current.lines.push({ text: '', citations: line.citations });
      }
      continue;
    }

    if (!current) continue; // Text ausserhalb einer Karte faellt weg.

    // Eine Leerzeile beendet die Karte - aber nur, wenn die Antwort schon Text
    // hat.
    //
    // Der Prompt trennt Karten durch Leerzeilen, und ohne diese Regel haengt
    // ein Schlusswort an der letzten Antwort. Nur schreibt dasselbe Modell die
    // Karte mal als `Q:\nA:` und mal als `Q:\n\nA:` -- im vierten echten Lauf
    // stand zwischen jeder Frage und ihrer Antwort eine Leerzeile, und mit der
    // einfachen Regel starb jede Karte, bevor sie eine Antwort hatte.
    //
    // Der verlaessliche Anfang einer Karte ist ihr `Q:`, nicht die Leerzeile
    // davor. Also schliesst eine Leerzeile nur, was schon eine Antwort ist.
    if (line.text.trim().length === 0) {
      if (line.citations.length > 0) current.lines.push({ text: '', citations: line.citations });
      if (current.lines.some((one) => one.text.trim().length > 0)) close();
      continue;
    }

    const answer = ANSWER.exec(line.text.trim());
    current.lines.push({ text: answer ? answer[1] : line.text.trim(), citations: line.citations });
  }

  close();
  return cards;
}
