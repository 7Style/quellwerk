# ADR-0005: Anonyme Session statt Benutzerkonten

Status: angenommen
Datum: 2026-09-10

## Kontext
Die Vorlage bringt ein vollständiges Kontosystem mit: Registrierung, Login, JWT mit Rotation,
Rollen, Berechtigungen, Zwei-Faktor, E-Mail-Versand. Quellwerk ist eine Bewerbungsdemo, die ein
Reviewer in einer Minute ausprobieren soll. Jede Hürde vor der ersten Frage kostet genau die
Aufmerksamkeit, die der Demo zusteht.

## Optionen
1. Anonyme Session über ein signiertes Cookie mit Redis-Store, 30 Tage. Jedes Notizbuch gehört einer Session.
2. Konten aus der Vorlage behalten. Kostet Registrierung, Bestätigungsmail und Passwortregeln vor der ersten Frage.
3. Magic Link ohne Passwort. Kostet immer noch einen Mailversand und eine gültige Adresse.

## Entscheidung
Option 1. Ein Reviewer öffnet die Seite und fragt. Das Kontosystem der Vorlage fliegt in M0
vollständig heraus, statt ungenutzt mitzulaufen; ungenutzter Auth-Code ist Angriffsfläche ohne
Gegenwert. Fremde Notizbücher beantworten wir mit 404 statt 403, damit eine geratene id nicht
bestätigt wird.

## Konsequenzen
Einfacher: kein Passwort-Hashing, keine Token-Rotation, keine Mailzustellung, keine Rollenmatrix.
Schwerer: ein Notizbuch ist an ein Cookie gebunden und über Geräte hinweg nicht erreichbar; das
gehört in KNOWN-LIMITS.md. Das Demo-Notizbuch braucht eine Sonderregel, weil es allen gehört:
lesbar für jeden, beim ersten Schreibzugriff in die eigene Session kopiert.
Zu testen: fremdes Notizbuch ergibt 404, Copy-on-first-write lässt das Original unverändert.

## Verworfen weil
Option 2 stellt vor die erste Frage mindestens drei Schritte und bringt Code mit, der in einer
Demo ohne Nutzen Risiko trägt. Option 3 braucht immer noch einen funktionierenden Mailweg und
scheitert an Spamfiltern genau dann, wenn jemand die Demo anschaut.

## Würde sich ändern, wenn
Mehrere Personen dasselbe Notizbuch benutzen sollen, oder wenn Inhalte über Geräte hinweg
erreichbar sein müssen. Dann sind Konten die kleinere Lösung als ein Teilen-Mechanismus ohne sie.
