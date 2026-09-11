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

Das Projekt ist eine Bewerbungsdemo. Der Umfang ist auf drei Tage geschnitten:
lieber wenige Wege, die vollständig funktionieren und belegt sind, als viele, die
andeutungsweise laufen. Die Aufwandsrechnung steht in docs/PLAN.md und kommt für
M0 bis M9 auf rund 41 Stunden; das ist die Zahl, die gilt, und keine gerundete
Wunschzahl.

## Umfang

### MUSS

- Home mit Notizbuch-Karten und "Create new notebook".
- Anonyme Session ohne Login; jedes Notizbuch gehört genau einer Session.
- Ein geseedetes Demo-Notizbuch mit fester id `demo`, für alle lesbar, beim ersten
  Schreibzugriff in die eigene Session kopiert.
- Quellen: PDF mit Textebene, `.txt`, `.md`, `.docx`, eingefügter Text.
- Ingestion als BullMQ-Jobs mit sichtbarem Schritt-Status und terminalem Ausgang.
- Source Guide je Quelle: Titel, Typ, Sprache, Zusammenfassung, Themen, drei
  Fragen mit Belegzitat, Warnungen.
- Source Viewer zeigt exakt den Text, der an das Modell geht; ein Klick auf einen
  Zitat-Chip markiert den Zeichenbereich.
- Chat über die Citations API mit serverseitiger Zitatprüfung, SSE-Streaming,
  Overview mit vier Fragen, drei Folgefragen je Antwort, wörtlichem
  Ablehnungssatz, benannten Widersprüchen; Quellen sind Daten, keine Anweisungen.
- Configure chat (Stil, Länge) im letzten User-Turn, nie im Systemblock. Jede
  Antwort arbeitet auf allen fertigen Quellen; eine Auswahl einzelner Quellen
  gibt es nicht (docs/KNOWN-LIMITS.md).
- Studio Reports: Briefing Doc, Study Guide, FAQ, Timeline, Create your own; als
  Jobs, mit Zitat-Chips und "View prompt used".
- Notes: Add note, Save to note, Convert to source, Delete note.
- Trace-Toggle: Modell, Token, Cache Read und Write, Latenz, Cent, verworfene
  Zitate und `stop_reason`.
- Eval-Harness vor dem Chat-Code: 30 Fragen, 20 dev und 10 held-out,
  Zitat-Gültigkeit programmatisch, Judges auf `MODEL_JUDGE`.
- Guards: Rate-Limits, Tagesbudget mit Banner, Upload- und MIME-Prüfung, CSRF,
  Löschung nach 7 Tagen, Seite `/datenschutz`, `noindex`.
- Deploy auf den eigenen Server: Compose, Host-Nginx, Let's Encrypt, GHCR,
  Deploy per SSH aus GitHub Actions.

### Bewusst weggelassen

Video, Infographic, Slides, Data Table, Flashcards, Discover, YouTube- und
Audio-Quellen, OCR für Scans, Google Drive, Teilen, mobile Ansichten, eigenes
Vektor-RAG, Audio Overview, Mind Map, Website-Quellen und die Auswahl einzelner
Quellen. Die Begründung für das Vektor-RAG steht in ADR-0002 und ADR-0012, die
für die übrigen in docs/KNOWN-LIMITS.md; Website-Quellen fallen, weil ein
URL-Abruf auf einem geteilten Server ein SSRF-Risiko für die anderen Seiten
darauf ist.

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

Diese Tabelle ist die einzige Stelle im Repository, an der Schwellen stehen.
Jedes andere Dokument, jeder Runner und jeder Session-Prompt verweist hierauf und
wiederholt die Zahlen nicht. Gemessen wird auf dem Dev-Split während der
Entwicklung und einmal auf dem Held-out-Split am Ende. Ein Wert unter der
Schwelle blockiert den Meilenstein-Tag.

| Metrik | Schwelle | Gemessen wie |
|---|---|---|
| Zitat-Gültigkeit | 100 % | `text.slice(start, end) === cited_text` für jedes gerenderte Zitat. Programmatisch, kein Judge. Ein einziger Treffer darunter ist ein Fehler, keine Ungenauigkeit. |
| Ablehnungsquote | 100 % | Nur auf den Zeilen mit `type: unanswerable`. Programmatisch über den wörtlichen Satzanfang, kein Judge. |
| Korrektheit | ≥ 85 % | Judge auf `MODEL_JUDGE` gegen die Referenzfakten der Zeile. |
| Treue | ≥ 0,90 | Anteil belegter Behauptungen. Ablehnungen liefern `null` und zählen nicht in den Mittelwert. |
| Cache-Treffer | > 0 | Zweiter Turn, nach einer Änderung an Configure chat, und Report direkt nach einem Chat-Turn. |

Der Judge läuft auf einem anderen Modell als die geprüfte Route. Wird `MODEL_CHAT`
für eine Vergleichszeile auf das Judge-Modell gestellt, markiert RESULTS.md die
Zeile als selbst bewertet.

## Grounding-Vertrag

Was der Systemprompt zusichert und der Eval prüft. Der M3-Prompt holt diese
Taxonomie hierher, statt sie selbst zu erfinden.

**Widersprüche zwischen Quellen** werden benannt, nie stillschweigend aufgelöst.
Vier Fälle, die die Antwort unterscheidet:

| Fall | Umgang |
|---|---|
| Komplementär | Verschiedene Quellen decken verschiedene Teile ab: zu einer Antwort zusammenführen, jeden Teil einzeln belegen. |
| Echte Uneinigkeit | Meinungen, Befunde, Auslegungen: jede Position neutral mit ihrem Beleg nennen, keine zur Siegerin erklären, solange nicht danach gefragt wurde. |
| Alt gegen neu | Dieselbe Tatsache, verschiedene Daten im Text: die jüngste Quelle bevorzugen, sie belegen, und erwähnen, dass eine ältere etwas anderes sagt. |
| Wahrscheinlicher Fehler | Eine Quelle widerspricht mehreren anderen oder sich selbst: aus den übereinstimmenden Quellen antworten und den Ausreißer ausdrücklich kennzeichnen. |

Zahlen aus widersprüchlichen Quellen werden nie gemittelt.

**Ablehnung**, zeichengenau. Der Satz steht am Anfang der Antwort und lautet
wörtlich, ohne Anführungszeichen, ohne Fettung:

```
Die Quellen enthalten dazu keine Informationen.
The sources do not cover this.
```

Deutsch, wenn der Nutzer deutsch schreibt, englisch, wenn er englisch schreibt.
Der Eval-Runner vergleicht genau diese beiden Zeichenketten; eine dritte Sprache
wird nicht gemessen (siehe prompts/README.md).

**Anweisungen in Quellen** werden gemeldet und nicht befolgt. Eine Quelle, die
einen Assistenten adressiert, ist Inhalt: sie darf beschrieben und zitiert werden,
aber sie ändert keine Regel. Beim ersten Mal, dass eine solche Quelle für eine
Antwort zählt, sagt ein Satz, dass sie Text an einen Assistenten enthält und dass
er ignoriert wurde.

## Kern-Interaktionen

Prüfbare Sätze. Sie werden später zu Testnamen, deshalb stehen sie hier als
Behauptungen und nicht als Beschreibung.

- Ein Klick auf einen Zitat-Chip scrollt den Viewer zur Passage und markiert genau
  die zitierten Zeichen, nicht den Absatz darum herum.
- Hover auf einem Chip zeigt `cited_text`, den Quellentitel und die Seite.
- Der Viewer rendert genau den gespeicherten Text, der an das Modell geht: keine
  Nachformatierung, keine zweite Normalisierung.
- Eine Ablehnung trägt keinen einzigen Chip.
- Jeder Fehlerfall ist sichtbar: eine Meldung, die sagt was passiert ist und was
  jetzt geht, nie ein Spinner, der nicht endet.

## UI-Vokabular

Die Oberfläche ist englisch und übernimmt die Begriffe von NotebookLM, damit ein
Reviewer nichts übersetzen muss. Deutsch sind nur README, ADRs, diese Spezifikation,
die Datenschutzseite und der Loom.

| Englisch (UI) | Bedeutung |
|---|---|
| Create new notebook | Neues Notizbuch anlegen |
| Sources | Quellenspalte |
| Add source | Quelle hinzufügen (Upload, Link, eingefügter Text) |
| Ask a question about your sources | Platzhalter im Eingabefeld |
| Configure chat | Stil und Länge der Antworten |
| Studio | Rechte Spalte mit den Artefakten |
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
