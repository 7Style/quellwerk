# ADR-0003: Quelltext wird genau einmal normalisiert, Zitate zeigen auf Zeichen-Offsets

Status: angenommen
Datum: 2026-09-10

## Kontext
Die Citations API liefert Offsets in den Text, den wir gesendet haben. Der Viewer rendert Text,
die Prüfung vergleicht Text. Weichen diese drei auch nur um ein Zeichen voneinander ab, zeigt die
Markierung an die falsche Stelle und die Prüfung verwirft gültige Zitate.

## Optionen
1. Einmal normalisieren beim Ingest, das Ergebnis speichern und für immer unverändert lassen.
2. Roh speichern und bei jedem Gebrauch normalisieren. Kostet nichts an Speicher, aber jede Änderung an der Funktion verschiebt alle bestehenden Offsets.
3. Roh speichern und Offsets über eine Abbildung zwischen roher und normalisierter Fassung umrechnen.

## Entscheidung
Option 1. Es gibt genau eine Zeichenkette je Quelle: `Source.text`. Sie geht an das Modell, sie
wird im Viewer gerendert, gegen sie wird geprüft. Die Normalisierung passiert in
`modules/sources/internal/normalize.ts` und nirgendwo sonst.

## Konsequenzen
Einfacher: die Prüfung ist ein Stringvergleich ohne Umrechnung; der Viewer braucht keine
Abbildung. Schwerer: eine Änderung an der Normalisierung entwertet gespeicherte Quellen, also
gehört sie hinter Tests und im Zweifel hinter eine Neu-Ingestion. Zu testen: zweimal normalisieren
ändert nichts, und eine Seitenzuordnung übersteht den Rundlauf.

## Verworfen weil
Option 2 macht jede spätere Korrektur an der Normalisierung zu einem stillen Datenfehler in allen
bestehenden Notizbüchern. Option 3 fügt eine Abbildung hinzu, die selbst falsch sein kann, und
zwar genau an Stellen mit ungewöhnlichen Zeichen, also dort, wo Zitate ohnehin am schwersten sind.

## Würde sich ändern, wenn
Der Viewer die Originalformatierung eines PDF darstellen soll. Dann braucht es die Abbildung aus
Option 3, und die Prüfung müsste auf der normalisierten Fassung bleiben.
