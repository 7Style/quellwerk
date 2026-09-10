# ADR-0009: Hintergrundarbeit als BullMQ-Worker auf Redis, nicht im Request

Status: angenommen
Datum: 2026-09-10

## Kontext
Drei Arbeiten dauern länger als eine HTTP-Antwort: Ingestion einer Quelle (laden,
extrahieren, normalisieren, Source Guide auf einem Modell), ein Report (ein Modellaufruf über
bis zu 150.000 Token Kontext) und die Audio Overview (Skript plus Sprachsynthese). Gleichzeitig
gilt die Regel aus CLAUDE.md, dass der API-Prozess nie länger auf ein Modell wartet als einen
Chat-Turn.

## Optionen
1. BullMQ-Worker als eigener Prozess auf Redis; die Route legt die Zeile an, stellt den Job ein und antwortet sofort.
2. Arbeit im Request erledigen. Kostet nichts an Infrastruktur, blockiert aber den Prozess.
3. Serverlose Hintergrundfunktionen bei einem Anbieter.

## Entscheidung
Option 1. Vier Queues: `ingest`, `artifact`, `audio`, `maintenance`. Ein Auftrag ist idempotent
über (Notizbuch, Typ, Parameter): derselbe Schlüssel zweimal erzeugt ein Ergebnis, nicht zwei.
Der Overview-Job wird über eine feste jobId je Notizbuch mit `delay` eingestellt, sodass drei
schnell hintereinander hinzugefügte Quellen eine Berechnung auslösen statt drei. Jeder Schritt
schreibt `step` und `heartbeatAt` auf die Zeile, die er bearbeitet; hängengebliebene Arbeit wird
über den Index `(status, heartbeatAt)` gefunden und neu gestellt. Der ioredis-Client benutzt
`maxRetriesPerRequest: null`, wiederkehrende Aufträge laufen über `upsertJobScheduler`, und
Job-Ids enthalten keinen Doppelpunkt, weil BullMQ ihn intern als Trenner verwendet.

## Konsequenzen
Einfacher: ein Upload blockiert den Chat nicht; ein abgestürzter Worker verliert keinen Auftrag,
weil der Zustand auf der Zeile steht; der Fortschritt ist sichtbar, weil `step` in der Oberfläche
landet. Schwerer: ein zweiter Prozess im Compose, und jeder Job muss terminal enden, auch im
Fehlerfall. Zu testen: derselbe Job zweimal ergibt ein Ergebnis, jeder Schritt schreibt einen
Heartbeat, ein Fehler endet als `failed` mit Grund statt als hängender Auftrag.

## Verworfen weil
Option 2 scheitert an der Zeit: ein Ingest mit Extraktion und Source Guide liegt über dem, was
ein HTTP-Timeout und ein Proxy zulassen, und ein Reverse Proxy schneidet die Verbindung ab,
bevor die Arbeit fertig ist. Option 3 scheitert an der Laufzeitgrenze von 300 Sekunden, die ein
Report über 150.000 Token reißen kann, und hätte kein gemeinsames Volume für Uploads.

## Würde sich ändern, wenn
Die längste Arbeit zuverlässig unter zwei Sekunden bliebe, oder wenn mehrere Instanzen des
Workers nötig würden; dann bräuchte die Idempotenz eine Sperre statt eines eindeutigen Schlüssels.
