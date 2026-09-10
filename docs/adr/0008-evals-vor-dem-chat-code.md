# ADR-0008: Das Eval-Harness entsteht vor der Chat-Route

Status: angenommen
Datum: 2026-09-10

## Kontext
Die Qualität einer Antwort hängt an Prompts, und Prompts ändert man in kleinen Schritten. Ohne
Messung ist jeder Schritt eine Meinung. Die Frage ist nur, wann das Messwerkzeug entsteht: vor
der Route, die es misst, oder danach.

## Optionen
1. Harness in M1, gegen einen Stub-Answerer aus aufgezeichneten Fixtures, bevor die Chat-Route existiert.
2. Harness nach dem Chat, wenn es etwas zu messen gibt.
3. Kein Harness, dafür Stichproben von Hand.

## Entscheidung
Option 1. Das Harness misst zwei Dinge, die keinen Chat brauchen: die Zitat-Gültigkeit
programmatisch und die Ablehnungserkennung gegen den wörtlichen Satz. Beides läuft gegen Fixtures
und ohne API-Schlüssel, also auch in CI. Wenn die Route dazukommt, wird der Stub durch den
Live-Answerer ersetzt und die erste Zahl steht am selben Tag. Der Golden-Set entsteht von Hand
(Hook auf `golden.jsonl`), damit das Harness nicht seine eigenen Hausaufgaben benotet.

## Konsequenzen
Einfacher: der erste Prompt-Schritt hat sofort eine Vorher-Zahl; CI kann eine Regression an einem
kaputten Zitat erkennen, ohne dass Kosten entstehen. Schwerer: die Fixtures müssen gepflegt
werden, und der Stub muss ehrlich sein, also auch falsche Zitate liefern können.
Zu testen: eine absichtlich kaputte Fixture treibt den Lauf auf einen Fehlerausgang.

## Verworfen weil
Option 2 führt dazu, dass die ersten und wichtigsten Prompt-Entscheidungen ohne Messung fallen und
später niemand mehr weiß, ob eine Änderung geholfen hat. Option 3 skaliert nicht auf 30 Fragen mal
mehrere Revisionen und liefert keine Zahl, die in RESULTS.md stehen kann.

## Würde sich ändern, wenn
Die Zitat-Gültigkeit dauerhaft bei 100 Prozent liegt und der Aufwand sich auf die Judges verlagert;
dann wandert der programmatische Teil in einen Unit-Test und das Harness misst nur noch Qualität.
