# ADR-0012: Modus B, pgvector-Hybrid mit search_result-Blöcken, dokumentiert statt gebaut

Status: angenommen
Datum: 2026-09-10

## Kontext
ADR-0002 legt das ganze Notizbuch in den Kontext und deckelt es bei 150.000 Token. Das ist die
richtige Entscheidung für die Korpusgröße, für die Quellwerk gebaut ist, und sie hat eine harte
Kante: darüber geht es nicht weiter. Die Frage, was oberhalb dieser Kante passiert, kommt in
jedem Gespräch über dieses Projekt, und "wir haben kein RAG" ist keine Antwort, sondern eine
Lücke im Denken.

## Optionen
1. Den nächsten Schritt entwerfen und dokumentieren, ohne ihn zu bauen.
2. Ihn jetzt bauen. Kostet Embedding-Pipeline, Index und Relevanzstufe in einem Projekt, dessen Umfang bereits über dem Zeitbudget liegt.
3. Die Frage offen lassen.

## Entscheidung
Option 1. Modus B greift oberhalb des Token-Gates und lässt alles darunter unverändert:

Quellen werden zusätzlich zerlegt und eingebettet, in Postgres mit pgvector. Zu jeder Frage
laufen zwei Suchen, die Vektorsuche und die Postgres-Volltextsuche, und ihre Ergebnisse werden
per Reciprocal Rank Fusion zusammengeführt, weil die beiden Verfahren unterschiedliche Fehler
machen: die Vektorsuche verliert exakte Bezeichner, die Volltextsuche verliert Umschreibungen.

Die gefundenen Abschnitte gehen als `search_result`-Blöcke in den Request statt als
Dokumentblöcke. Der entscheidende Punkt: diese Blöcke tragen ebenfalls Citations. Die
Zitat-Oberfläche, der Resolver und die serverseitige Prüfung bleiben damit unverändert, und der
Nutzer sieht denselben Chip auf demselben markierten Text. Modus B ändert, welcher Text im
Kontext liegt, nicht wie ein Zitat entsteht oder geprüft wird.

Was verloren geht, steht ebenfalls fest: Fragen über das Notizbuch als Ganzes und Widersprüche
zwischen Quellen, die kein Retriever zusammen findet. Deshalb ist Modus B der Schritt oberhalb
der Kante und nicht der bessere Weg darunter.

## Konsequenzen
Einfacher: die Frage nach Vektorsuche hat eine Antwort mit einem Entwurf statt einer
Verlegenheit; das Token-Gate ist als Grenze begründet und nicht als Sackgasse. Schwerer: nichts,
solange nichts gebaut wird. Zu testen: nichts. Dieses ADR ist Dokumentation, kein Auftrag.

## Verworfen weil
Option 2 baut eine Relevanzstufe, die diese Demo nicht evaluieren könnte, in ein Zeitbudget, das
laut docs/PLAN.md ohnehin überschritten ist. Option 3 lässt die naheliegendste Frage zum Entwurf
unbeantwortet, und zwar die, deren Antwort zeigt, ob die Grenze aus ADR-0002 verstanden oder nur
gesetzt wurde.

## Würde sich ändern, wenn
Ein Korpus regelmäßig über 150.000 Token liegt. Dann wird aus diesem Dokument ein Meilenstein.
