# ADR-0011: Drei Modellstufen, ein Effort je Cache-Namensraum, und was das kostet

Status: angenommen
Datum: 2026-09-10

## Kontext
Quellwerk ruft ein Modell auf sieben Wegen: Chat, Reports, Overview, Mind Map, Audio-Skript,
Source Guide, Notizbuchtitel, Folgefragen, dazu die Eval-Judges. Die Wege unterscheiden sich um
Größenordnungen in Kontext und Anspruch. Ein Notizbuch trägt bis zu 150.000 Token (docs/SPEC.md),
und der Kontext geht bei jedem Chat-Turn mit (ADR-0002), also entscheidet die Modellwahl über die
Kosten der ganzen Demo.

## Optionen
1. Drei Stufen: ein starkes Modell für alles, was der Nutzer liest, ein schnelles für Beiwerk, ein drittes als Judge.
2. Ein Modell für alles. Kostet den vollen Preis auch für einen Notizbuchtitel aus vier Wörtern.
3. Je Route frei wählen. Kostet den Cache, sobald zwei Routen sich einen Namensraum teilen sollen.

## Entscheidung
Option 1, aufgelöst über `MODEL_CHAT`, `MODEL_FAST` und `MODEL_JUDGE` in
`backend/app/config/models.ts`; im Code steht nie eine Modell-ID.

`claude-opus-5` für Chat und Reports mit `EFFORT_CHAT`, für Overview und Mind Map mit `low`,
für das Audio-Skript mit `high`. Chat und Reports teilen sich zwingend ein Effort, weil sie sich
einen Cache-Namensraum teilen (ADR-0007). Overview, Mind Map und Audio-Skript laufen über den
Artefakt-Builder, und dort injiziert jedes Schema einen eigenen Systemprompt; sie haben ohnehin
je einen eigenen Cache-Eintrag, also darf ihr Effort abweichen.

`claude-haiku-4-5` für Source Guide, Notizbuchtitel und Folgefragen. Diese Requests tragen kein
`output_config.effort`: das Modell steht nicht auf der Liste der Modelle, die den Parameter
unterstützen. Sie setzen auch keinen `thinking`-Parameter. Genau formuliert, weil die Nuance
zählt: Haiku 4.5 lehnt Thinking nicht grundsätzlich ab, sondern kann nur Extended Thinking und
weist `adaptive` mit 400 zurück; da Thinking ohne Parameter ohnehin aus ist, wird der Parameter
schlicht weggelassen.

`claude-sonnet-5` als Judge, damit der Judge sich vom geprüften Modell unterscheidet. Wird
`MODEL_CHAT` für eine Vergleichszeile auf Sonnet gestellt, bleibt der Judge Sonnet und RESULTS.md
markiert die Zeile als selbst bewertet.

## Konsequenzen
Einfacher: ein Wechsel von Opus auf Sonnet ist eine Zeile in der Konfiguration, und die
Kostentabelle unten zeigt beide Zeilen nebeneinander. Schwerer: drei Modelle heißen drei Zeilen in
`prices.ts` und drei Fälle in der Preisrechnung. Zu testen: kein Request auf `MODEL_FAST` trägt
`effort` oder `thinking`; jeder Modellaufruf schreibt eine `usage_log`-Zeile mit getrennten
Cache-Write-Feldern.

Ein Detail mit Fallhöhe: die Mindestlänge, ab der ein Cache-Breakpoint überhaupt greift, ist
modellabhängig und beträgt 512 Token für Opus 5, 1.024 für Sonnet 5 und 4.096 für Haiku 4.5.
Kürzere Prompts werden ohne Cache verarbeitet, ohne Fehlermeldung. Ein Breakpoint auf einer
kleinen Quelle im Source Guide tut also nichts und ist auch nicht als Fehler sichtbar; sichtbar
wird es nur an `cache_read_input_tokens`.

## Kosten

Listenpreise je Million Token, geprüft am 2026-09-10 gegen
https://platform.claude.com/docs/en/about-claude/pricing:

| Modell | Eingabe | Ausgabe |
|---|---|---|
| claude-opus-5 | 5,00 USD | 25,00 USD |
| claude-sonnet-5 | 2,00 USD | 10,00 USD |
| claude-haiku-4-5 | 1,00 USD | 5,00 USD |

Cache-Aufschläge, geprüft gegen dieselbe Seite: ein Cache-Write mit fünf Minuten kostet das
1,25-Fache des Eingabepreises, ein Write mit einer Stunde das Zweifache, ein Cache-Read ein
Zehntel. Die Mindestlängen stehen unter
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.

Ein Notizbuch mit 100.000 Token Kontext und einer Antwort von 800 Ausgabe-Token:

| Posten | Opus 5 | Sonnet 5 |
|---|---|---|
| Erster Turn, 1h-Cache-Write (2x Eingabe) | 1,000 USD | 0,400 USD |
| Erster Turn, 5-Minuten-Write (1,25x Eingabe) | 0,625 USD | 0,250 USD |
| Jeder gecachte Turn, Read (0,1x Eingabe) | 0,050 USD | 0,020 USD |
| Ausgabe je Antwort, 800 Token | 0,020 USD | 0,008 USD |
| Gecachter Turn gesamt | 0,070 USD | 0,028 USD |

Die Umschaltung ist eine Zeile: `MODEL_CHAT=claude-sonnet-5` senkt den gecachten Turn auf zwei
Fünftel. Wer dauerhaft umschaltet, setzt `MODEL_JUDGE` auf ein anderes Modell, damit der Judge
nicht die eigene Route benotet.

## Verworfen weil
Option 2 zahlt für einen Titel aus vier Wörtern denselben Ausgabepreis wie für einen Report und
verschenkt damit den Unterschied zwischen 25 und 5 USD je Million Ausgabe-Token. Option 3 klingt
flexibel, kostet aber genau dort, wo es weh tut: Chat und Report teilen sich den Kontext von
150.000 Token, und ein abweichendes Effort verwirft diesen Cache, also 2,00 USD Neuaufbau statt
0,05 USD Lesen bei Opus.

## Würde sich ändern, wenn
Die Preise sich ändern, ein Modell mit gleicher Qualität und niedrigerem Preis erscheint, oder die
Demo dauerhaft läuft und die Kosten je Antwort über dem liegen, was eine Bewerbungsdemo
rechtfertigt.
