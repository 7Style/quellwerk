# PDF als Text, nicht als PDF

ADR-0010 entscheidet, dass ein PDF als extrahierter Text mit einer Seitenkarte
in den Kontext geht und nicht als PDF-Block. Dieses Dokument hält die Messungen
fest, auf denen die Entscheidung steht.

Gemessen am 11.09.2026 über `messages.countTokens` auf `claude-opus-5`, an
`backend/evals/corpus/01-ki-vo-auszug.pdf`: 25 Seiten aus der Verordnung
(EU) 2024/1689, deutscher Amtsblatt-Satz, Subset-Schriften.

## Derselbe Auszug, zweimal gezählt

| | Token | je Seite |
|---|---|---|
| als Textblock (extrahiert, normalisiert) | 48.088 | 1.924 |
| als PDF-Block (base64, `application/pdf`) | 87.906 | 3.516 |

**Faktor 1,83.** Das PDF kostet 83 Prozent mehr, für denselben Inhalt.

Der Grund ist, dass ein PDF-Block nicht nur als Text zählt: das Modell bekommt
jede Seite zusätzlich als Bild. Das ist der Sinn der Sache, wenn ein Dokument
Tabellenlayout, Diagramme oder Handschrift trägt. Ein Verordnungstext trägt
nichts davon.

Was der Unterschied im Betrieb bedeutet, bei 5 USD je Million Input-Token:

| | je Chat-Turn ohne Cache | mit Cache-Treffer (0,1x) |
|---|---|---|
| Text | 0,240 USD | 0,024 USD |
| PDF | 0,440 USD | 0,044 USD |

Bei einem Notizbuch, das mehrere Turns lang benutzt wird, ist das der
Unterschied zwischen einer Demo, die ein paar Euro kostet, und einer, die es
nicht tut.

## Der eigentliche Grund ist aber nicht der Preis

Zitate zeigen auf Zeichen-Offsets in `Source.text` (ADR-0003). Diese Offsets
existieren nur, wenn der Text selbst im Request steht: bei einem PDF-Block
zitiert die Citations-API auf Seiten, nicht auf Zeichen, und der Viewer könnte
eine Passage nicht mehr zeichengenau markieren. Die Kernaussage des Produkts –
ein Klick auf einen Chip markiert **genau** die zitierten Zeichen – hängt am
Textblock.

Die Seitenzahl geht dabei nicht verloren. Die Seitenkarte aus
`modules/sources/internal/pages.ts` bildet jeden Offset auf seine Seite ab, also
zeigt der Hover weiterhin "Seite 14", obwohl das Modell nie eine Seite gesehen
hat.

Der Preis ist trotzdem erwähnenswert, weil er in dieselbe Richtung zeigt. Eine
Entscheidung, die richtig und teurer wäre, müsste man verteidigen; diese nicht.

## Deutsch kostet ungefähr doppelt so viel wie Englisch

Beim Messen des Demo-Notizbuchs (`scripts/recount-tokens.ts demo`) fiel etwas
auf, das für die 150.000er-Grenze wichtiger ist als der PDF-Vergleich:

```
  pos  kind   chars     tokens  chars/token  title
    1  pdf     99,201     48,127         2.06  Verordnung (EU) 2024/1689, Auszug
    2  md      41,183     12,597         3.27  Europäische Kommission: Navigating the AI Act
    3  md       3,654      1,886         1.94  Glossar: Begriffe der EU-KI-Verordnung
    4  paste    1,429        833         1.72  Interne Notiz
  4 sources, 63,443 tokens, 42.3% of the 150,000 token cap.
```

Die englische Kommissions-FAQ bringt 3,27 Zeichen je Token, die deutschen
Quellen zwischen 1,72 und 2,06. Deutsch braucht also **rund die Hälfte** an
Zeichen für dieselbe Tokenzahl: Komposita und Flexionsendungen zerfallen in
mehrere Tokens, wo ein englisches Wort eines ist.

Zwei Folgen, beide praktisch:

**Die Grenze von 150.000 Token ist für deutsche Quellen eine andere Grenze.**
Sie entspricht etwa 300.000 deutschen Zeichen, aber fast 500.000 englischen. Wer
die Kappung in Zeichen im Kopf hat, verschätzt sich um fast das Doppelte.

**Eine Schätzung über Zeichen durch vier wäre hier um 70 bis 130 Prozent
danebengelegen.** Genau deshalb misst das Kapazitäts-Gate am echten Request und
nicht an einer Faustformel (`docs/SPEC.md`, "Zahlen").

Der Korpus wurde vorab auf "etwa 42.000 Token" geschätzt. Gemessen sind es
63.443, also gut die Hälfte mehr. Die Schätzung war nicht schlampig, sie war
englisch gedacht.

## Wie man das nachstellt

```bash
pnpm db:seed
pnpm --filter @quellwerk/backend exec tsx scripts/recount-tokens.ts demo
```

Der Zähl-Endpunkt ist kostenlos und hat ein eigenes Rate-Limit, getrennt von der
Nachrichten-Erzeugung. Ein Durchlauf über das Demo-Notizbuch kostet nichts außer
ein paar Sekunden.
