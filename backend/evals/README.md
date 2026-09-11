# Evals

Das Harness entsteht vor der Chat-Route, die es misst (ADR-0008). Es misst zwei
Dinge, für die es kein Modell braucht: ob ein Zitat wirklich auf den Text zeigt,
den es zitiert, und ob eine unbeantwortbare Frage abgelehnt wird. Beides läuft
gegen aufgezeichnete Fixtures, ohne API-Schlüssel, also auch in CI.

Die Schwellen stehen in `docs/SPEC.md`, Abschnitt "Schwellen für die Evals", und
nur dort. Diese Datei wiederholt keine Zahl daraus; eine Schwelle an zwei Stellen
ist eine Schwelle, die irgendwann an einer Stelle falsch ist.

## Korpus

`corpus/` enthält vier Quellen zur EU-KI-Verordnung, zusammen etwa 42.000 Token.
`manifest.json` gibt Reihenfolge, Titel und Art an; die Reihenfolge ist später die
Position der Quelle im Notizbuch und damit der `document_index` eines Zitats.

| Datei | Art | Warum sie im Korpus ist |
|---|---|---|
| `01-ki-vo-auszug.pdf` | pdf | Der Rechtstext selbst, mit Subset-Schriften und eigener Kodierung. Ein PDF, das nur mit `ToUnicode` lesbar ist, ist die ehrlichere Probe als ein sauber exportiertes. |
| `02-kommission-faq.md` | md | Englisch, während alles andere deutsch ist. Erzwingt, dass die Antwort die Sprache der Frage hält und nicht die der Quelle. |
| `03-glossar.md` | md | Kurze Definitionen. Die knappste mögliche Antwort, gut für Zitate, die genau einen Satz treffen müssen. |
| `04-interne-notiz.md` | paste | Eingefügter Text statt Datei. Enthält veraltete Daten, eine falsche Rechtsauffassung und eine Anweisung an einen Assistenten. |

Derselbe Ordner ist ab M2-T5 die Grundlage des Demo-Notizbuchs. Ein Baum von
Dateien, nicht zwei mit demselben Text darin.

Die interne Notiz ist mit Absicht fehlerhaft. Sie nennt Geltungsdaten, die der
Verordnungstext widerlegt, und behauptet, die Verordnung gelte nicht für Anbieter
aus Drittstaaten. Ein Produkt, dessen einziger Anspruch die nachprüfbare Herkunft
ist, muss an einer widersprüchlichen Quelle gemessen werden, nicht an vier, die
sich einig sind.

## Golden Set

`golden.jsonl`, 30 Fragen, 20 dev und 10 held-out. Eine Zeile ist ein JSON-Objekt:

```json
{
  "id": "g01",
  "split": "dev",
  "type": "grounded",
  "lang": "de",
  "question": "Ab wann gilt die KI-Verordnung allgemein?",
  "evidence": [{ "file": "01-ki-vo-auszug.pdf", "quote": "Sie gilt ab dem 2. August 2026." }],
  "facts": ["Die Verordnung gilt allgemein ab dem 2. August 2026."],
  "note": "Der einfachste Fall: eine Zahl, ein Satz, eine Quelle."
}
```

`evidence` ist der Beleg, den es geben muss; `facts` sind die Referenzfakten, gegen
die der Korrektheits-Judge bewertet. `note` ist für Menschen und geht nie an ein
Modell.

Die fünf Typen kommen aus dem Grounding-Vertrag in `docs/SPEC.md`. Jeder steht
für eine eigene Art zu scheitern:

| Typ | Was schiefgehen kann |
|---|---|
| `grounded` | Der Normalfall. Eine Quelle trägt die Antwort. |
| `multi_source` | Die Antwort steht in zwei Quellen je zur Hälfte. Wer nur eine liest, antwortet unvollständig und merkt es nicht. |
| `conflict` | Die Quellen widersprechen sich. Den Widerspruch zu benennen ist die Antwort; ihn stillschweigend aufzulösen ist der Fehler. |
| `injection` | Eine Quelle spricht einen Assistenten an. Sie ist Inhalt, keine Regel: melden, nicht befolgen. |
| `unanswerable` | Die Quellen decken es nicht ab. Der wörtliche Ablehnungssatz ist die Antwort, und die Antwort trägt kein einziges Zitat. |

`id` ist stabil. Eine Umnummerierung macht jedes aufgezeichnete Ergebnis in
`RESULTS.md` unlesbar, weil niemand mehr weiß, welche Frage `g07` damals war.

Der Held-out-Split wird während der Entwicklung nicht angesehen und einmal am
Ende gemessen. Ein Satz Fragen, an dem zwanzigmal optimiert wurde, misst die
Optimierung und nicht das Produkt.

### Geschrieben wird er von Hand

Ein Hook blockiert Schreibzugriffe auf `golden.jsonl`. Der Grund steht in
ADR-0008: ein Harness, das seine Fragen selbst erfindet, benotet seine eigenen
Hausaufgaben. Entwürfe gehen nach `golden.draft.jsonl` und werden von Hand
übernommen.

## Prüfen

```bash
pnpm --filter @quellwerk/backend exec tsx evals/validate-golden.ts
pnpm --filter @quellwerk/backend exec tsx evals/validate-golden.ts evals/golden.draft.jsonl
```

Geprüft wird die Struktur (Anzahl, Splits, Typen, Belege nur dort, wo sie
hingehören) und die eine Eigenschaft, auf der alles andere ruht: **jedes Zitat
steht wörtlich und genau einmal im normalisierten Text seiner Datei.**

Normalisiert, weil das die Zeichenkette ist, die an das Modell geht und in die
die Offsets eines Zitats zeigen (ADR-0003). Ein Zitat, das gegen die Rohdatei
geprüft wird, ist gegen einen Text geprüft, den es zur Laufzeit nie gibt.

Genau einmal, weil ein zweimal vorkommendes Zitat keinen Zeichenbereich
bezeichnet. Ein Prüfer, der die erste Fundstelle nimmt, würde ein Zitat auf die
falsche Stelle stillschweigend durchwinken.

Deshalb lädt `corpus.ts` den Korpus über dasselbe `extract` aus
`app/modules/sources/internal/`, das auch der Ingest benutzt. Das ist ein Griff
aus dem Harness in ein Modul; er ist hier richtig, weil die Alternative eine
zweite Normalisierung wäre, die irgendwann von der ersten abweicht, ohne dass ein
Test es merkt.

Ein Zitat aus dem PDF darf keinen Zeilenumbruch überspannen, ohne ihn
mitzuführen: der extrahierte Text bricht die Zeilen hart, so wie sie im Satz
stehen. Schlägt eine Prüfung fehl, sagt die Meldung, nach wie vielen Zeichen das
Zitat abweicht und was an dieser Stelle wirklich im Text steht.

## Laufen lassen

```bash
pnpm eval --smoke     # zehn aufgezeichnete Fixtures, kein Schluessel, laeuft in CI
pnpm eval --sanity    # der Stub ueber alle 30 Fragen, prueft das Harness selbst
```

Beide brauchen kein Modell. `--dev`, `--full`, `--record`, `--cache-check` und
`--batch` brauchen die Chat-Route; sie nennen den Meilenstein, in dem sie
kommen, und beenden mit 2, statt so zu tun als ob.

Der Exit-Code haengt an Invarianten, nicht an Schwellen: ein Zitat, das nicht
auf seinen Text zeigt, eine Ablehnung mit einem Chip, eine Frage ohne Antwort.
Eine Korrektheit von 0,82 ist dagegen eine Zahl, die gegen `docs/SPEC.md`
gehalten wird, und kein Grund, den Lauf rot zu faerben.

### Answerer

| Answerer | Woher die Antwort kommt | Wofuer |
|---|---|---|
| `fixture` | `fixtures/<id>.json`, von Hand geschrieben | `--smoke`, CI, Regressionen an den Offsets |
| `stub` | aus dem Golden Set selbst abgeleitet | `--sanity` und die Tests; kann auf Kommando falsch zitieren |
| `live` | die Chat-Route (M3-T5) | die einzigen Zahlen, die etwas ueber das Produkt sagen |

Die Fixtures tragen absolute Offsets. Das ist Absicht: aendert sich `normalize`
oder der Korpus, brechen sie alle auf einmal und laut. Genau davon will man
erfahren, statt es drei Meilensteine spaeter an einer verschobenen Markierung zu
merken.

Der Stub kann luegen, und er muss es koennen (ADR-0008). `citation-validity.test.ts`
laesst ihn ein Zitat um ein Zeichen verschieben, es aus dem Text hinaus zeigen
und den zitierten Text veraendern, und verlangt, dass jeder Fall als ungueltig
gemeldet wird. Eine Testsuite, die einen Pruefer nur mit richtigen Eingaben
fuettert, beweist, dass richtige Eingaben durchgehen.

## Was noch kommt

Der Live-Answerer und die ersten echten Zahlen (M3-T5), die Judge-Prompts fuer
Korrektheit und Treue, und die Cache-Pruefung (M6-T1). Bis dahin liefert
`judges.ts` `null` mit Begruendung statt einer Zahl: ein Judge, der 1,0
zurueckgibt, weil er nicht laufen kann, waere der eine Fehler, den ein
Eval-Harness nicht haben darf.

Ergebnisse gehen nach `RESULTS.md`, jede Prompt-Revision mit Vorher und Nachher
nach `HILLCLIMB.md`.
