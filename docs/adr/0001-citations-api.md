# ADR-0001: Zitate kommen aus der Citations API, nicht aus dem Prompt

Status: angenommen
Datum: 2026-09-10

## Kontext
Der einzige Anspruch des Produkts ist, dass jede Behauptung auf eine Stelle in einer Quelle
zurückführbar ist (docs/SPEC.md, Abschnitt Ziel). Ein Zitat muss deshalb zwei Dinge liefern:
den zitierten Text und die Position im gespeicherten Quelltext. Ohne Position gibt es keine
Markierung im Viewer und keine programmatische Prüfung, sondern nur ein Modell, das behauptet,
richtig zitiert zu haben.

## Optionen
1. Citations API: Quellen als `text/plain` document blocks, das Modell liefert `cited_text` mit `start_char_index` und `end_char_index`. Kostet die Bindung an einen Anbieter und schließt strukturierte Ausgaben im selben Aufruf aus.
2. Prompt-basierte Zitate: Quellen nummeriert in den Prompt, das Modell schreibt Marker wie `[3]`. Kostet nichts an Struktur, liefert aber keine Offsets.
3. Nachträgliches Zuordnen: Antwort erzeugen, dann per Textsuche die Belegstelle finden. Kostet einen zweiten Durchlauf und rät bei Paraphrasen.

## Entscheidung
Option 1. Die API liefert Offsets in genau den Text, den wir gesendet haben, und damit ist die
serverseitige Prüfung `text.slice(start, end) === cited_text` überhaupt erst möglich. Diese eine
Zeile ist der Unterschied zwischen "das Modell sagt, es hat zitiert" und "wir haben nachgesehen".
Die Eval misst sie als harte Metrik mit Schwelle 100 Prozent.

## Konsequenzen
Einfacher: Markierung im Viewer, Chips, Prüfung, Messung der Zitat-Gültigkeit ohne Judge.
Schwerer: Zitate und strukturierte Ausgaben lassen sich nicht kombinieren (HTTP 400), also
braucht es zwei Request-Builder (ADR-0007). Ein Anbieterwechsel würde diesen Pfad neu schreiben.
Zu testen: die Offset-Prüfung gegen eine echte Antwort, nicht nur gegen Fixtures.

## Verworfen weil
Option 2 liefert keine Zeichenposition; die Markierung im Viewer müsste raten, und die
Zitat-Gültigkeit wäre nur durch ein Modell bewertbar, das denselben Fehler machen kann.
Option 3 verdoppelt Latenz und Kosten je Antwort und scheitert genau dort, wo das Modell
paraphrasiert, also im interessanten Fall.

## Würde sich ändern, wenn
Ein zweiter Anbieter verlangt wird, oder wenn Zitate und strukturierte Ausgaben in einem
Aufruf möglich werden. Dann fällt der Grund für zwei Builder weg.
