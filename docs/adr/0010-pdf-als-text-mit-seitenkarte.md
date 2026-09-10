# ADR-0010: PDF geht als text/plain-Dokument mit Seiten-Offset-Karte, nicht als nativer PDF-Block

Status: angenommen
Datum: 2026-09-10

## Kontext
Die Citations API nimmt Quellen entweder als `text/plain`-Dokumentblock oder als nativen
PDF-Block entgegen. Der Viewer von Quellwerk soll die zitierte Stelle zeichengenau markieren
(docs/SPEC.md, Kern-Interaktionen), und die serverseitige Prüfung vergleicht Zeichen.

## Optionen
1. PDF beim Ingest extrahieren, einmal normalisieren, als `text/plain` senden und eine Karte von Seitenzahlen auf Zeichen-Offsets mitführen.
2. Das PDF als nativen Block senden und die Zitate so nehmen, wie sie kommen.
3. Beides senden. Kostet die doppelten Eingabe-Token je Quelle.

## Entscheidung
Option 1. Bei `text/plain` liefert die API `char_location` mit `start_char_index` und
`end_char_index`, beim nativen PDF-Block dagegen `page_location` mit Seitenzahlen. Eine
Seitenzahl reicht für einen Verweis, aber nicht für eine Markierung von genau den zitierten
Zeichen, und sie lässt sich nicht mit `slice === cited_text` prüfen. Die Seitenzahl geht nicht
verloren: die Seitenkarte bildet jeden Zeichenbereich auf seine Seite ab, sodass der Hover
weiterhin die Seite nennt. Gescannte PDFs ohne Textebene werden abgelehnt, mit einer Meldung,
die OCR vorschlägt; OCR selbst steht in der Liste der weggelassenen Dinge.

## Konsequenzen
Einfacher: ein Zitatpfad für alle Quellenarten, dieselbe Prüfung, dieselbe Markierung.
Schwerer: die Extraktion ist unsere Verantwortung, inklusive Spalten, Kopfzeilen und Ligaturen,
und ein PDF ohne Textebene ist ein Fehlerfall mit eigener Meldung. Der Token-Unterschied
zwischen beiden Varianten wird in M2-T5 am echten Request gemessen und in
`docs/ai-process/pdf-vs-text-tokens.md` festgehalten; dieses ADR nennt bewusst keine Zahl,
sondern verweist auf die Messung.

## Verworfen weil
Option 2 liefert nur `page_location`, und damit fällt die zeichengenaue Markierung weg, die der
einzige belegbare Anspruch des Produkts ist. Option 3 verdoppelt die Eingabe-Token je Quelle und
damit den Cache-Write, ohne dass der zweite Pfad etwas beiträgt, das der erste nicht kann.

## Würde sich ändern, wenn
Der native PDF-Block Zeichen-Offsets liefert, oder wenn die Darstellung des Originallayouts
wichtiger wird als die zeichengenaue Markierung.
