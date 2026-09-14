# Transkripte

Was von der Arbeit mit dem Agenten nachlesbar ist, und wo.

## Im Repository

| Datei | Was sie zeigt |
|---|---|
| [sessions/](sessions/) | Die bauende Session als Markdown, ein Dokument je Tag: meine Prompts wörtlich, die Antworten als Text, Werkzeugaufrufe als eine Zeile. Dazu die Subagent-Läufe, je Auftrag und Ergebnis. |
| [PROMPTS.md](PROMPTS.md) | Der Verweis auf die Exporte und das, was sie nicht zeigen: was ich abgelehnt habe. |
| [AI-DECLARATION.md](AI-DECLARATION.md) | Die Stufen je Prozess, die vom Modell erzeugten Daten und drei Fälle, in denen ich Ausgaben verworfen habe. |
| [DECISION-LOG.md](DECISION-LOG.md) | Entscheidungen aus den Sessions, die keinen eigenen ADR bekommen haben. |
| [../../backend/evals/HILLCLIMB.md](../../backend/evals/HILLCLIMB.md) | Eine Zeile je Prompt-Revision: was geändert wurde, was es mit den Zahlen gemacht hat. |
| [../../backend/evals/results/](../../backend/evals/results/) | Die Rohdaten jedes Eval-Laufs, eine JSON-Datei je Lauf, mit Modell, Split und Zeitstempel. |
| [../adr/](../adr/) | Die Entscheidungen, die den Aufbau tragen, jede mit den verworfenen Alternativen. |
| Git-Historie | Ein Commit je PLAN-Aufgabe, die Nachricht sagt was und warum, `Co-Authored-By` nennt das Modell. |
| [../../.claude/](../../.claude/) | Das Harness selbst: CLAUDE.md, die Hooks, die Skills, der Reviewer-Agent. Was der Agent tun durfte und was nicht, ist damit lesbar und nicht behauptet. |

## Was im Export steht und was nicht

Eingecheckt ist nicht das Rohtranskript, sondern ein Auszug daraus, erzeugt von
[../../scripts/export-sessions.mjs](../../scripts/export-sessions.mjs). Drei
Entscheidungen stecken darin, und jede ist eine Weglassung:

**Keine Werkzeugausgaben.** Sie sind der grösste Teil jedes Transkripts —
Dateiinhalte, Diffs, Testläufe, Datenbankzeilen. Was daran eine Entscheidung war,
steht in der Antwort daneben; der Rest ist Rauschen, das eine Datei von vier
Megabyte auf vierzig aufbläht. Jeder Werkzeugaufruf bleibt als eine Zeile stehen:
welches Werkzeug, worauf. Man sieht also, dass etwas gelesen, gemessen oder
ausgeführt wurde, nur nicht das Ergebnis.

**Kein Thinking.** Ein Zwischenstand ist kein Ergebnis. Als Beleg gelesen wäre er
ein Missverständnis, und zwar in beide Richtungen.

**Geschwärzt vor dem Schreiben.** Schlüssel, Token, Passwörter und
Verbindungs-URLs mit Zugangsdaten werden ersetzt, das Etikett bleibt stehen — man
sieht, dass dort ein Wert war, und welcher Art. Danach liest
[../../scripts/scan-secrets.mjs](../../scripts/scan-secrets.mjs) die
geschriebenen Dateien noch einmal, mit eigenen Mustern und ohne den Schwärzer zu
kennen: ein Prüfer, der die Annahme des Geprüften teilt, prüft nichts. Committet
wird erst, wenn ich die Treffer dieser zweiten Suche einzeln angesehen habe.

Absolute Pfade dieser Maschine stehen drin. Sie sind kein Geheimnis, und sie
herauszurechnen hätte die Befehlszeilen unlesbar gemacht.

Die Rohdateien selbst (`~/.claude/projects/<projektpfad>/*.jsonl`) bleiben
draussen, und die zweite Session — die geplant, vorbereitet und deployt hat,
siehe AI-DECLARATION.md — ist gar nicht dabei. Auf Anfrage gebe ich Ausschnitte
heraus.

## Und was ein Transkript nicht ist

Es ist kein Beweis. Es zeigt, was gesagt wurde; ob der Code tut, was er
behauptet, zeigen die Testausgaben, die Eval-Zahlen und der laufende Server. Die
interessanten Stellen sind ohnehin die, an denen etwas nicht stimmte: die zwölf
Funde des Reviewer-Subagenten in M6, die verworfene Neueinreihung, die ich gegen
das echte Redis nachgemessen habe, die vier fehlgeschlagenen Flashcard-Läufe. Sie
stehen im Export an ihrem Datum, mitsamt dem, was davor behauptet wurde.
