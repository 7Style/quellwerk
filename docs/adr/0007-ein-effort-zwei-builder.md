# ADR-0007: Ein Effort je Cache-Namensraum, zwei Request-Builder

Status: angenommen
Datum: 2026-09-10

## Kontext
Die Dokumente eines Notizbuchs liegen in `messages`, und genau darauf zielt der Cache. Ein
Wechsel von Modell oder `output_config.effort` erzeugt einen anderen Namensraum und verwirft den
Cache; bei 150.000 Token ist das der Unterschied zwischen Cache-Lesepreis und vollem Preis für
jeden Turn. Gleichzeitig lassen sich Zitate und strukturierte Ausgaben nicht kombinieren: die API
antwortet mit HTTP 400.

## Optionen
1. Ein Effort für Chat und Reports (`EFFORT_CHAT`), zwei Builder: `buildChatRequest` mit Zitaten und Textausgabe, `buildArtifactRequest` ohne Zitate mit strukturierter Ausgabe.
2. Effort je Route frei wählen. Kostet den Cache bei jedem Wechsel.
3. Ein Builder mit Schaltern. Kostet Klarheit an genau der Stelle, an der ein Fehler 400 heißt.

## Entscheidung
Option 1. Chat und Reports teilen sich den Cache, also teilen sie sich zwingend das Effort. Der
Artefakt-Builder ist ohnehin ein eigener Namensraum, weil abgeschaltete Zitate das Präfix ändern
und das Schema als zusätzlicher Systemprompt hinzukommt; dort darf das Effort je Artefakt
abweichen. Zwei Builder statt Schaltern, damit die Unvereinbarkeit im Typ steht und nicht im Kopf.

## Konsequenzen
Einfacher: der Cache trägt über Chat und Reports hinweg; niemand kann Zitate und Schema
versehentlich kombinieren. Schwerer: ein Report kann kein höheres Effort bekommen als der Chat,
ohne den gemeinsamen Cache zu verlieren. Zu testen: ein Breakpoint mit einer Stunde auf dem
letzten Dokumentblock, nichts auf dem Systemblock, kein Breakpoint auf einem Thinking-Block oder
einer Zitatstelle; Cache-Treffer im zweiten Turn und beim Report nach einem Chat-Turn.

## Verworfen weil
Option 2 kostet bei jedem Wechsel den vollen Preis für 150.000 Token, also mehr als die
Qualitätsdifferenz zwischen zwei Effort-Stufen wert ist. Option 3 verschiebt einen Fehler, den
der Typ verhindern kann, in die Laufzeit, wo er als HTTP 400 erscheint.

## Würde sich ändern, wenn
Zitate und strukturierte Ausgaben in einem Aufruf möglich werden, oder wenn Dokumente außerhalb
von `messages` zwischengespeichert werden können.
