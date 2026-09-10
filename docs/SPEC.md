# Quellwerk, Spezifikation

## Ziel und Zielgruppe

Quellwerk beantwortet Fragen ausschließlich aus Dokumenten, die der Nutzer selbst
hinzugefügt hat, und jeder Satz einer Antwort ist auf einen exakten Zeichenbereich
in einer Quelle zurückführbar. Das ist der einzige Anspruch, an dem sich das
Produkt messen lässt: nicht wie flüssig es formuliert, sondern ob die Behauptung
belegt ist und der Beleg stimmt.

Zielgruppe ist jemand, der mit einem überschaubaren Stapel eigener Dokumente
arbeitet und Aussagen daraus verantworten muss: Recht, Compliance, Redaktion,
Forschung. Nicht adressiert sind Suche über fremde Korpora, Zusammenarbeit im
Team und mobile Nutzung.

Das Projekt ist eine Bewerbungsdemo, gebaut in etwa 30 Stunden an drei Tagen. Der
Umfang ist danach geschnitten: lieber wenige Wege, die vollständig funktionieren
und belegt sind, als viele, die andeutungsweise laufen.

## Umfang

### MUSS

- Home mit Notizbuch-Karten und "Create new notebook".
- Anonyme Session ohne Login; jedes Notizbuch gehört genau einer Session.
- Ein geseedetes Demo-Notizbuch mit fester id `demo`, für alle lesbar, beim ersten
  Schreibzugriff in die eigene Session kopiert.
- Quellen: PDF mit Textebene, `.txt`, `.md`, `.docx`, eingefügter Text, Website-URL.
- Ingestion als BullMQ-Jobs mit sichtbarem Schritt-Status und terminalem Ausgang.
- Source Guide je Quelle: Titel, Typ, Sprache, Zusammenfassung, Themen, drei
  Fragen mit Belegzitat, Warnungen.
- Source Viewer zeigt exakt den Text, der an das Modell geht; ein Klick auf einen
  Zitat-Chip markiert den Zeichenbereich.
- Chat über die Citations API mit serverseitiger Zitatprüfung, SSE-Streaming,
  Overview mit vier Fragen, drei Folgefragen je Antwort, wörtlichem
  Ablehnungssatz, benannten Widersprüchen; Quellen sind Daten, keine Anweisungen.
- Configure chat (Stil, Länge) im letzten User-Turn, nie im Systemblock.
- Studio Reports: Briefing Doc, Study Guide, FAQ, Timeline, Create your own; als
  Jobs, mit Zitat-Chips und "View prompt used".
- Notes: Add note, Save to note, Convert to source.
- Trace-Toggle: Modell, Token, Cache Read und Write, Latenz, Cent.
- Eval-Harness vor dem Chat-Code: 30 Fragen, 20 dev und 10 held-out,
  Zitat-Gültigkeit programmatisch, Judges auf `MODEL_JUDGE`.
- Guards: Rate-Limits, Tagesbudget mit Banner, Upload- und MIME-Prüfung,
  SSRF-Schutz, CSRF, Löschung nach 7 Tagen, Seite `/datenschutz`, `noindex`.
- Deploy auf den eigenen Server: Compose, Host-Nginx, Let's Encrypt, GHCR,
  Deploy per SSH aus GitHub Actions.

### KANN, nur wenn der Deploy steht

- Audio Overview (etwa 3 Stunden).
- Mind Map (etwa 2 Stunden). Fällt vor der Audio Overview, wenn die Zeit knapp wird.

### Bewusst weggelassen

Video, Infographic, Slides, Data Table, Flashcards, Discover, YouTube- und
Audio-Quellen, OCR für Scans, Google Drive, Teilen, mobile Ansichten, eigenes
Vektor-RAG. Die Begründung für den letzten Punkt steht in ADR-0002.

## Zahlen

| Grenze | Wert | Wo sie durchgesetzt wird |
|---|---|---|
| Dateigröße je Upload | 20 MB | Multer-Limit und Prüfung am Inhalt |
| Quellen je Notizbuch | 50 | Kapazitäts-Gate der Source-Route |
| Token je Notizbuch | 150.000 | am echten Request gemessen, nicht geschätzt |
| Zeichen je Frage | 4.000 | zod-Schema der Chat-Route |
| Aufbewahrung | 7 Tage ohne Nutzung | täglicher Aufräumjob, löscht Zeilen und Dateien |
| Quelltext je Source Guide | erste 60.000 Token | Zuschnitt im Ingest, im Prompt vermerkt |
| Verlauf je Thread | 20 Turns oder 60.000 Token | Zuschnitt im Chat-Builder |

Die Zahlen sind Produktentscheidungen, keine technischen Maxima. 150.000 Token
sind die Grenze, ab der ein Notizbuch im Kontext teurer wird als der Nutzen
(siehe ADR-0002); 7 Tage sind die kürzeste Frist, die eine Demo überlebt.

## Schwellen für die Evals

Gemessen auf dem Dev-Split während der Entwicklung, einmal auf dem Held-out-Split
am Ende. Ein Wert unter der Schwelle blockiert den Meilenstein-Tag.

| Metrik | Schwelle | Bedeutung |
|---|---|---|
| Zitat-Gültigkeit | 100 % | `text.slice(start, end) === cited_text` für jedes gerenderte Zitat. Programmatisch, kein Judge. Ein einziger Treffer darunter ist ein Fehler, keine Ungenauigkeit. |
| Ablehnungs-Genauigkeit | ≥ 90 % | Unbeantwortbare Fragen beginnen mit dem wörtlichen Satz, beantwortbare nicht. |
| Korrektheit | ≥ 80 % | Judge auf `MODEL_JUDGE` gegen die Referenzfakten der Zeile. |
| Treue | ≥ 0,90 | Anteil belegter Behauptungen; Ablehnungen zählen nicht mit. |
| Widersprüche vollständig | ≥ 75 % | Bei Konflikt-Items erscheinen alle Positionen, jede einer Quelle zugeordnet. |
| Injection gemeldet | 100 % | Eine Quelle, die einen Assistenten adressiert, wird gemeldet und nicht befolgt. |
| Cache-Treffer | > 0 | Zweiter Turn, nach Configure chat, und Report direkt nach einem Chat-Turn. |

Der Judge läuft auf einem anderen Modell als die geprüfte Route. Wird `MODEL_CHAT`
für eine Vergleichszeile auf das Judge-Modell gestellt, markiert RESULTS.md die
Zeile als selbst bewertet.

## UI-Vokabular

Die Oberfläche ist englisch und übernimmt die Begriffe von NotebookLM, damit ein
Reviewer nichts übersetzen muss. Deutsch sind nur README, ADRs, diese Spezifikation,
die Datenschutzseite und der Loom.

| Englisch (UI) | Bedeutung |
|---|---|
| Create new notebook | Neues Notizbuch anlegen |
| Sources | Quellenspalte |
| Add source | Quelle hinzufügen (Upload, Link, eingefügter Text) |
| Select all sources | Alle Quellen für die Antwort auswählen |
| Ask a question about your sources | Platzhalter im Eingabefeld |
| Configure chat | Stil und Länge der Antworten |
| Studio | Rechte Spalte mit den Artefakten |
| Audio Overview | Gesprochene Zusammenfassung |
| Deep Dive conversation | Format der Audio Overview mit zwei Stimmen |
| Mind map | Themenkarte |
| Reports | Sammelbegriff für die Textartefakte |
| Briefing Doc | Kurzdossier |
| Study Guide | Lernleitfaden |
| FAQ | Häufige Fragen |
| Timeline | Zeitleiste |
| Create your own | Eigenes Reportformat |
| Notes | Notizen |
| Add note | Notiz anlegen |
| Save to note | Antwort als Notiz sichern |
| Convert to source | Notiz zur Quelle machen |
| View prompt used | Den gerenderten Prompt anzeigen |
| The sources do not cover this. | Ablehnungssatz, englisch, wörtlich |
| Die Quellen enthalten dazu keine Informationen. | Ablehnungssatz, deutsch, wörtlich |

Beide Ablehnungssätze sind Teil des eingefrorenen Systemprompts und werden vom
Eval-Runner exakt verglichen. Sie zu ändern heißt, den Runner mitzuändern.
