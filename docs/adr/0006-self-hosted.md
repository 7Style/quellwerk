# ADR-0006: Self-hosted auf dem eigenen Server statt Vercel und Neon

Status: angenommen
Datum: 2026-09-10

## Kontext
Quellwerk braucht dauerhafte Prozesse: einen Worker für Ingestion und Reports, Redis für
Warteschlangen und Sessions, ein Volume für hochgeladene Dateien und SSE-Verbindungen, die eine
Antwort lang offen bleiben. Dazu kommt eine Datenschutzseite, die benennen muss, wo Daten liegen.

## Optionen
1. Docker Compose auf dem eigenen Server, Host-Nginx mit Let's Encrypt, Images über GHCR, Deploy per SSH aus GitHub Actions.
2. Vercel für das Frontend, Neon für Postgres, ein Drittdienst für Redis und den Worker.
3. Ein verwalteter Container-Dienst für alles.

## Entscheidung
Option 1. Der Worker und die offenen SSE-Verbindungen passen nicht in ein Funktionsmodell mit
Laufzeitgrenze, und ein Volume für Uploads gibt es dort ebenfalls nicht. Der Server steht in
Deutschland, was die Datenschutzseite zu einem Satz macht statt zu einer Aufzählung von
Auftragsverarbeitern. Der einzige externe Aufruf bleibt die Modellinferenz.

## Konsequenzen
Einfacher: ein Ort für alles, gleiche Compose-Datei lokal und in Produktion, kein Kaltstart, keine
Laufzeitgrenze, Dateien liegen auf einem Volume. Schwerer: Server-Härtung, Zertifikate,
Sicherungen und Firewall sind meine Aufgabe; die Checkliste dafür steht in SECURITY.md, Abschnitt 8.
Zu testen: Deploy aus dem Workflow, gültiges Zertifikat, Kaltstartzeit nach einer Stunde Ruhe.

## Verworfen weil
Option 2 kann den Worker nicht ausführen und schneidet SSE an der Funktionslaufzeit ab; dazu
verteilt sie die Daten auf drei Anbieter, die alle in die Datenschutzerklärung gehören.
Option 3 nimmt einen Teil der Arbeit ab, bringt aber dieselbe Verteilung auf fremde Systeme
zurück, ohne die Härtungsaufgabe wirklich zu ersetzen.

## Würde sich ändern, wenn
Die Demo dauerhaft laufen soll und der Betrieb mehr Zeit kostet als die Ersparnis wert ist, oder
wenn eine EU-Residenzpflicht auch für die Inferenz gefordert wird.
