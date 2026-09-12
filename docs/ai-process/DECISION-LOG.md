# Entscheidungslog

Entscheidungen aus den Sessions, die keinen eigenen ADR bekommen haben, weil sie
eine Stelle betreffen und nicht den Aufbau. Die tragenden Entscheidungen stehen
in [../adr/](../adr/) und sind unveränderlich; hier stehen die kleinen, die man
sonst nur aus einem Diff erschließen kann.

Eine Zeile je Entscheidung, mit dem Grund und mit dem Ort, an dem sie im Code
oder in den Dokumenten steht.

| Datum | Entscheidung | Grund | Wo sie steht |
|---|---|---|---|
| 11.09. | Eine Ablehnung trägt keine Belege, auch wenn das Modell welche liefert | Ein Beleg an "das steht nicht in den Quellen" belegt nichts und sieht aus wie ein Widerspruch | `chat/internal/refusal.ts`, `chat.service.ts` |
| 11.09. | Die beiden Ablehnungssätze (de/en) stehen an einer Stelle, die Route und Eval teilen | Zwei Kopien desselben Satzes heißt, dass der Eval irgendwann einen anderen Satz prüft als die Route sendet | `chat/internal/refusal.ts` |
| 11.09. | `g14` im Golden-Entwurf geändert, statt den Prompt anzupassen | Das Item widersprach einer Regel, die vor dem Lauf im eingefrorenen Systemprompt stand; die neue Erwartung ist nicht leichter | `HILLCLIMB.md`, `AI-DECLARATION.md` |
| 12.09. | Keine Häkchen zur Auswahl einzelner Quellen | Ein wechselnder Teil der Dokumente ist ein anderer Cache-Präfix: voller Preis bei jeder Umschaltung | `KNOWN-LIMITS.md`, `SPEC.md` |
| 12.09. | Eine eigene Route für den Quelltext, mit derselben Sitzungsprüfung | Der Viewer braucht genau den gespeicherten Text, in den die Offsets zeigen — nicht eine zweite Fassung | `sources.service.ts` (`text`) |
| 12.09. | `refused` als Feld an der Nachricht, statt eines vierten Ablehnungssatzes im Frontend | Der Server entscheidet, ob abgelehnt wurde; das Frontend soll es nicht aus Text erraten | `chat/dto`, `frontend/.../types/message.ts` |
| 12.09. | Reports laufen über `buildChatRequest`, nicht über einen eigenen Builder | Gleiche Dokumente, gleicher Systemblock, gleicher Effort: ein zweiter Builder wäre ein zweiter Cache-Namensraum | `wiring/studio.ts`, `prompts/README.md` |
| 12.09. | Der Reportrenderer liest Überschriftenzeilen, sonst nichts | Die Struktur wird im Prompt bestellt, also muss sie gezeichnet werden; alles Weitere zu parsen wäre Raten am Beleg | `components/cited-text.tsx` |
| 12.09. | Die erste Überschrift ist der Titel, egal mit wie vielen Rauten sie markiert ist | Der Prompt verlangt eine Ebene eins, das Modell liefert manchmal zwei; die Position ist das, was nie wandert | `components/cited-text.tsx` |
| 12.09. | Reports haben ihre eigene Rate-Schranke, nicht die der Quellen | Der teuerste Aufruf des Produkts braucht eine eigene Obergrenze, und zwanzig Uploads dürfen keinen Report blockieren | `modules/index.ts`, `SECURITY.md` 7.3 |
| 12.09. | Die Meldung eines Bibliotheksfehlers geht nicht ins Log | Ein 400 von oben zitiert den Block, den es abgelehnt hat, und die Blöcke sind die Dokumente | `common/utils/error-cause.util.ts` |
| 12.09. | Die IDs der Demo-Quellen sind aus dem Dateinamen abgeleitete UUIDs | Die Textroute verlangt eine UUID; aus dem Namen und nicht aus der Position, damit eine fünfte Quelle keine IDs verschiebt | `prisma/seed-data/demo.ts` |
| 12.09. | Guides, Übersicht und Token-Zahlen des Demo-Notizbuchs liegen als Datei im Repository | Der Server stellt denselben Stand her statt einen leicht anderen zu bezahlen | `prisma/seed-data/demo.json` |
| 12.09. | Nur `demo-reset` kommt ins Produktions-Image, der Generator nicht | Ein Skript, das ein Modell aufruft, hat in einem Produktions-Image nichts zu suchen | `tsconfig.build.json` |
| 12.09. | Das Demo-Notizbuch steht in der Liste jedes Besuchers, eigene Notizbücher zuerst | Eine leere Startseite sieht aus wie ein Fehler; nach `lastUsedAt` sortiert würde das Demo in jedem Raster nach oben wandern | `notebooks/internal/prisma.repository.ts` |
| 12.09. | `DEMO_OFFLINE` bleibt offen und die Box ungehakt | Der Schalter ist für eine Maschine ohne Schlüssel; die Vorführung läuft gegen den Server mit Schlüssel | `PLAN.md` M8-T1 |
| 12.09. | Copy-on-first-write nicht gebaut, das Demo-Notizbuch bleibt lesbar | Eigentum und Kosten einer Kopie (63.000 Token) sind keine Entscheidung neben einer Aufnahme | `KNOWN-LIMITS.md` |
