# ADR-0004: Das Anthropic-SDK direkt, kein LangChain

Status: angenommen
Datum: 2026-09-10

## Kontext
Quellwerk braucht drei Dinge vom Anbieter, die alle nah am Protokoll liegen: die Citations API mit
Offsets, `cache_control` an einer bestimmten Position im Nachrichtenbaum und strukturierte
Ausgaben über `zodOutputFormat`. Alle drei sind Details, die ein Framework abstrahiert.

## Optionen
1. `@anthropic-ai/sdk` direkt, gekapselt hinter `ILlmProvider` mit einer einzigen Implementierung.
2. LangChain als Abstraktionsschicht. Kostet eine Indirektion pro Aufruf und bindet an dessen Fassung der Anbieter-Features.
3. Eigener HTTP-Client. Kostet Streaming, Wiederholungen und Typen, die das SDK mitbringt.

## Entscheidung
Option 1. Die drei Merkmale, auf denen das Produkt steht, sind genau die, bei denen ein Framework
hinterherhinkt oder eine eigene Auslegung hat. Der Anbieterwechsel bleibt trotzdem denkbar, weil
`AnthropicLlmAdapter` die einzige Stelle ist, die den Client erzeugt und die API ruft; typ-only
Importe aus dem SDK sind überall erlaubt, damit keine handgeschnitzten Interfaces entstehen.

## Konsequenzen
Einfacher: neue Anbieter-Merkmale sind am Tag der Veröffentlichung nutzbar; Typen kommen aus dem
SDK statt aus dem eigenen Kopf. Schwerer: ein zweiter Anbieter erfordert eine zweite Adapterklasse
mit eigener Zitatlogik. Zu testen: dass kein Modul außerhalb des Adapters den Client instanziiert.

## Verworfen weil
Option 2 hätte für die Citations API und die Cache-Breakpoints entweder keine oder eine eigene
Abstraktion, und die Fehlersuche fände dann in fremdem Code statt. Option 3 schreibt Streaming und
Wiederholungslogik nach, die das SDK bereits mit `maxRetries` mitbringt.

## Würde sich ändern, wenn
Ein zweiter Anbieter dauerhaft dazukommt und beide dieselben drei Merkmale so ähnlich anbieten,
dass eine gemeinsame Abstraktion nichts verschweigt.
