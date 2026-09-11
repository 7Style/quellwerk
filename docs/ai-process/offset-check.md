# Zeigen die Zitate wirklich dorthin, wo sie hinzeigen?

Quellwerk behauptet eine Sache: jeder Satz einer Antwort ist auf einen exakten
Zeichenbereich in einer Quelle zurückführbar. Dieses Dokument hält fest, wie das
geprüft wird und was dabei herauskam.

Die Prüfung selbst ist eine Zeile:

```ts
source.text.slice(citation.start_char_index, citation.end_char_index) === citation.cited_text
```

Nicht "ungefähr gleich", nicht nach erneutem Normalisieren, nicht nach Trimmen.
Der gespeicherte Text wurde genau einmal beim Ingest normalisiert und seitdem
nicht angefasst (ADR-0003); das Modell hat exakt diese Zeichenkette bekommen,
also gibt ein ehrliches Zitat sie exakt wieder.

## Zwei Prüfungen, die verschiedene Dinge zeigen

**Die Unit-Tests** (`citations.test.ts`, 19 Stück) zeigen, dass der Prüfer
funktioniert: ein um ein Zeichen verschobener Offset wird verworfen, ein Index
auf das falsche Dokument wird verworfen, eine Ortsangabe, die keine
Zeichenposition ist, wird verworfen. Sie können mit erfundenen Zitaten arbeiten,
weil sie den Prüfer testen und nicht die API.

**Die Sonde** (`backend/scripts/offset-probe.ts`) zeigt etwas anderes: dass die
Offsets, die die API tatsächlich schickt, zu dem passen, was wir gespeichert
haben. Das ist eine Aussage über zwei Systeme, die übereinstimmen müssen, und die
lässt sich nicht simulieren — man muss fragen.

## Ergebnis, 11.09.2026

```
offset probe on claude-opus-5, 4 sources

  9/9  5 with a page   Ab wann gilt die KI-Verordnung allgemein?
  8/8  8 with a page   Welche Praktiken verbietet Artikel 5?
  3/3  2 with a page   Was ist ein Betreiber im Sinne der Verordnung?
  8/8  2 with a page   Ab wann gelten die Pflichten fuer Hochrisiko-Systeme?
  1/1  0 with a page   Was sagt die interne Notiz ueber das Bewerber-Screening?

29 of 29 citations matched
cost: 1.0031 USD
```

**29 von 29.** Kein verworfenes Zitat, über fünf Fragen an vier Quellen in drei
Formaten: ein PDF mit Subset-Schriften, zwei Markdown-Dateien und eingefügter
Text.

Die zweite Spalte prüft die Seitenkarte mit: Zitate in das PDF lösen auf eine
Seite auf, Zitate in die eingefügte Notiz nicht. Das ist richtig so — eine Notiz
hat keine Seiten, und eine erfundene "Seite 1" im Hover wäre eine Zahl, die
nichts bedeutet.

Bemerkenswert ist die dritte Zeile: acht Zitate in den Verordnungstext, **acht**
davon mit Seitenzahl, obwohl das Modell nie eine Seite gesehen hat. Es bekommt
den extrahierten Text; die Seitenkarte aus `modules/sources/internal/pages.ts`
bildet den Offset nachträglich auf die Seite ab. Genau deshalb geht das PDF als
Text hinein und nicht als PDF-Block (ADR-0010, gemessen in
`pdf-vs-text-tokens.md`).

## Was ein Fehlschlag bedeutet hätte

Die Sonde beendet mit 1, wenn ein Zitat nicht passt, und nennt Grund, Quelle,
Offsets und beide Längen — nie den zitierten Text und nie den Ausschnitt. Beides
ist Quellinhalt, und Quellinhalt gehört nicht in ein Log.

Sie beendet auch mit 1, wenn **gar kein** Zitat zurückkam. "0 von 0 bestanden"
als grün zu melden ist der Weg, auf dem eine Prüfung aufhört, eine Prüfung zu
sein.

## Wann sie wieder laufen muss

Nach jeder Änderung an `normalize`, an `extract`, an der Seitenkarte oder am
Chat-Request-Builder. Alle vier entscheiden mit, welche Zeichenkette im
Dokumentblock landet, und ein Fehler darin fällt an keiner anderen Stelle auf:
Die Antwort liest sich weiterhin gut, der Chip sitzt weiterhin da, und er markiert
die falsche Stelle.
