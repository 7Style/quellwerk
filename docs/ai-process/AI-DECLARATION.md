# AI Declaration

Format nach ai-declaration.md. Stufen: none, hint, assist, pair, copilot, auto.

```yaml
global: pair
processes:
  design: assist        # Entscheidungen von mir, Entwürfe vom Modell
  implementation: copilot
  testing: pair
  documentation: assist
  review: pair          # Reviewer-Subagent plus eigene Durchsicht
  deployment: copilot   # Server, .env und Deploy von der zweiten Session
tools:
  - Claude Code (Fable 5.1 / Opus 5)
  - Claude API (Opus 5, Haiku 4.5, Sonnet 5 als Eval-Richter)
```

## Notes

### Zwei Sessions, und wer was gemacht hat

Gearbeitet wurde mit zwei Claude-Code-Sessions nebeneinander, und das ist für
diese Erklärung der wichtigste Satz: nicht alles in diesem Repository kommt aus
der Session, die den Code geschrieben hat. Unten wird deshalb benannt, welche
gemeint ist.

Die **bauende Session** schreibt den Code: eine Aufgabe aus docs/PLAN.md nach
der anderen, ein Commit je Aufgabe, Tests und Screenshots dazu.

Die **zweite Session** hat mit mir geplant und vorbereitet. Sie hat die Prompts
vorformuliert, mit denen ich die bauende Session gesteuert habe; SECURITY.md aus
meinen vier eigenen Dokumenten zusammengesetzt; den Demo-Korpus zusammengestellt;
`golden.jsonl` nach meiner Freigabe aus dem Entwurf kopiert; den Server
eingerichtet samt `.env` und den dort erzeugten Secrets — den Anthropic-Schlüssel
habe ich selbst eingetragen; und sie hat deployt und danach live nachgeprüft.

Entschieden und freigegeben habe ich. Beide Sessions haben vorgeschlagen; was
ich abgelehnt habe, steht weiter unten.

Von mir allein geschrieben: die README-Prosa nach der Überarbeitung.

### Das Golden Set, genau wie es entstanden ist

Es ist der Grenzfall dieser Erklärung, deshalb steht es hier ausführlich und
nicht in einem Halbsatz.

Den Entwurf hat die bauende Session aus dem Korpus geschrieben: dreißig Fragen
über fünf Typen, die erwarteten Fakten dazu und dreiunddreißig Belegzitate.
Ablegen durfte sie ihn nur als `backend/evals/golden.draft.jsonl`; ein Hook
verbietet ihr jeden Schreibzugriff auf `backend/evals/golden.jsonl` (ADR-0008). Der Grund ist
nicht Misstrauen gegen den Entwurf, sondern die Rolle der Datei: ein Harness, das
seine eigenen Hausaufgaben benotet, misst nichts.

Ich habe den Entwurf durchgesehen und freigegeben; kopiert hat ihn danach die
zweite Session. Der Hook sperrt die Session, die den Eval schreibt, gegen die
Datei, an der sie gemessen wird — eine andere Hand als die, die geprüft wird.
Unverändert heißt hier byteweise identisch, und das ist eine Aussage über die
Prüfung, nicht über ihren Aufwand: ein Item ging vorher zurück. `g14`
verlangte, bei widersprüchlichen Terminen den Verordnungstext als bindend zu
markieren. Das widerspricht der Konfliktregel des eingefrorenen Systemprompts,
die bei einer veralteten Quelle die neuere bevorzugt, und dem Korpus, in dem die
Kommissions-FAQ vom 11.09.2026 den seit dem 27.07.2026 geltenden Digital Omnibus
nennt. Der Agent hat den Widerspruch beim ersten Dev-Lauf gemeldet, die Erwartung
im Entwurf geändert und die Begründung nach `backend/evals/HILLCLIMB.md`
geschrieben; freigegeben habe ich sie. Ein Golden-Item zu ändern, bis das Modell
besteht, ist der Weg, auf dem ein Eval aufhört zu messen — dass hier der Prompt
älter war als die Erwartung, ist der Unterschied.

Alle Eval-Zahlen vor dem 12.09.2026 stammen aus dem Entwurf. Der Runner schreibt
das in jeden Lauf und in jede Ergebnisdatei, und die Blöcke in
`backend/evals/RESULTS.md` sagen es in ihrer ersten Zeile.

Die zehn Held-out-Items sind einmal gemessen, in M9-T1 am 12.09.2026, und davor
kein einziges Mal; jede Messung während der Entwicklung lief auf den zwanzig
Dev-Items. Ein Held-out-Split, der jeden Tag gemessen wird, ist ein Dev-Split
mit Zusatzschritten.

Der Lauf hat einen Fehlschlag gefunden: `g30` wurde nicht mit dem wörtlichen
Satz abgelehnt, die Abstinenz liegt damit bei 85,7 Prozent statt bei 100. Weder
der Prompt noch die Messung sind danach geändert worden, und das ist die
eigentliche Aussage dieses Abschnitts: die Zahl steht in RESULTS.md, im README
und hier, mit dem Grund und mit der Reihenfolge, in der sie zu beheben wäre.
Eine Zahl, die man nach dem Messen passend macht, ist keine Messung.

### Vom Modell erzeugte Daten, die im Repository liegen

Zwei Dateien sind Modell-Ausgabe und keine Handarbeit, und beide sagen das über
sich selbst:

`backend/prisma/seed-data/demo.json` trägt die Guides der vier Demo-Quellen und
die Übersicht des Demo-Notizbuchs, erzeugt von `scripts/make-demo-data.ts` in
einem Lauf am 12.09.2026 für 40 Cent. Die Datei nennt Datum, Modelle und Kosten
in ihren ersten Zeilen. Sie liegt im Repository, damit der Server denselben Stand
herstellt wie meine Maschine, statt einen leicht anderen zu bezahlen. Ich habe
sie gelesen, bevor sie eingecheckt wurde; verändert habe ich nichts, auch nicht
ein `hasInstructions: true` am Glossar, das ich für einen Fehlalarm halte — es
steht in KNOWN-LIMITS statt korrigiert in der Datei, weil eine von Hand
verbesserte Modell-Ausgabe keine Messung mehr ist.

Die zehn Fixtures unter `backend/evals/fixtures/` sind das Gegenstück: von Hand
geschrieben, weil es vor M3-T5 keine Route gab, die sie hätte erzeugen können.
Jede sagt in `recordedBy`, woher sie kommt.

### Was ich verworfen oder umgeschrieben habe

Drei Fälle, an denen sich die Stufe `pair` ablesen lässt. Sie sind nicht die
einzigen; sie sind die, bei denen der Unterschied zwischen "sieht gut aus" und
"stimmt" Geld oder das Video gekostet hätte.

1. **Die Segmente einer Antwort wurden mit Leerzeilen verbunden.** Der Agent
   hatte an drei Stellen `segments.map(s => s.text).join('\n\n')` geschrieben,
   und das zerriss jeden Satz an jedem Beleg — Tests grün, Antwort kaputt.
   Aufgefallen ist es erst im Screenshot. Ersetzt durch eine Funktion
   `answerText()` mit Tests, die an allen drei Stellen aufgerufen wird.

2. **Die Quellenliste prüfte `writable` statt `readable`.** Damit zeigte das
   Demo-Notizbuch keinem Besucher eine einzige Quelle, obwohl es für jeden
   lesbar ist. Genau dort wäre die Vorführung gestorben. Der Reviewer-Subagent
   hat es gemeldet, ich habe es gegen den laufenden Stack nachgestellt, bevor
   ich es geglaubt habe.

3. **"Try again" an einem fehlgeschlagenen Report reihte nichts neu ein.** Der
   Agent hatte die Zeile auf `queued` zurückgesetzt und dieselbe Job-ID erneut
   eingestellt; BullMQ verwirft ein `add` auf eine ID, die es schon kennt, und
   der fehlgeschlagene Job liegt als erledigt noch darunter. Ich habe die
   Behauptung nicht als Argument akzeptiert, sondern gegen das echte Redis
   gemessen: zweites `add` lief null mal, `remove` und dann `add` lief einmal.
   Erst danach die Korrektur.

Dazu drei Dinge, die ich am Prozess selbst geändert habe, statt an einer Datei:
`golden.jsonl` ist für die bauende Session schreibgeschützt (Hook), ADRs sind
unveränderlich (Hook), und jede Datei mit Secrets ist dort für jedes Werkzeug
gesperrt, auch für `cat` in einer beiläufigen Shell-Zeile — die bauende Session
hat nie einen Schlüssel gesehen.

Auf dem Server hat die zweite Session die Konfiguration eingerichtet und die
Secrets dort erzeugt; den Anthropic-Schlüssel habe ich selbst eingetragen. Das
ist die Stelle, an der `deployment` oben auf `copilot` steht und nicht auf
`assist`.

### Die Sicherheitsprüfung

Am Ende von M2, M3, M4 und M6 hat ein Reviewer-Subagent den Diff des
Meilensteins gegen SPEC, PLAN und SECURITY.md gelesen
(`.claude/agents/reviewer.md`, im Repository nachlesbar). Zwölf Funde in M6,
zwei davon hoch. Behoben wurde erst, was vorher nachgestellt war: die verworfene
Neueinreihung gegen das echte Redis, die verlorene Seitenzahl gegen die
Datenbank, die falsche Schranke gegen die Konfiguration, die sie seit M0 nicht
gelesen hat. Nachgestellt hat das die bauende Session, auf meine Ansage, und die
Ausgaben stehen in den Commit-Nachrichten — nachlesbar für jemanden, der mir
nicht glaubt. Was offen geblieben ist, steht in KNOWN-LIMITS mit dem Grund. Ein Agent, der einen Agenten prüft, ist kein Review; ein Agent, der
eine Spur legt, die ich nachlaufen kann, ist eins.

Die Co-Authored-By-Trailer in der Git-Historie sind korrekt.
