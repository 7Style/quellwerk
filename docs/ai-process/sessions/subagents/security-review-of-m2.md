# Security review of M2

Subagent-Lauf `reviewer`, 59 Werkzeugaufrufe.
Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist
Werkzeugausgabe (siehe [README.md](../README.md)).

## Auftrag

> Sicherheitsprüfung für Meilenstein M2 im Repository /Users/7style/Projects/quellwerk. Lies zuerst CLAUDE.md, SECURITY.md (besonders Abschnitt 7) und docs/SPEC.md.
>
> Geprüft wird, was M2 hinzugefügt hat. Der Diff sind die Commits von 27cf669 bis HEAD:
> `git log --oneline 27cf669~1..HEAD` und `git diff 27cf669~1..HEAD --stat`.
>
> Die neuen Angriffsflächen:
> - Neue Routen: POST/GET /api/notebooks, GET /api/notebooks/:id, POST/GET /api/notebooks/:notebookId/sources
> - Datei-Upload über multer (backend/app/common/middleware/upload.middleware.ts)
> - Anonyme Session über express-session mit Redis (backend/app/modules/session/*)
> - Ein BullMQ-Worker, der Dateien von der Platte liest und Modellaufrufe macht (backend/app/worker.ts, backend/app/modules/sources/internal/ingest.job.ts)
> - Drei Prompts in prompts/, die Nutzerinhalte verarbeiten
> - usage_log als neue Tabelle mit Kostendaten
>
> Prüfe konkret und melde nur, was du belegen kannst, mit Datei und Zeile:
>
> 1. **Zugriffskontrolle.** Kann eine Session ein fremdes Notizbuch lesen oder beschreiben? Antwortet jeder Fehlerfall 404 statt 403? Gibt es einen Pfad, der die Prüfung überspringt?
> 2. **Prompt-Injection.** Landet Nutzertext irgendwo anders als in einem Dokumentblock oder im letzten User-Turn? Greift die Winkelzeichen-Ersetzung im Renderer überall, wo sie soll? Gibt es einen Weg, über einen Dateinamen oder Titel Struktur in einen Prompt zu bringen?
> 3. **Upload.** Was passiert mit der hochgeladenen Datei? Pfad-Traversal über originalname? Bleiben Dateien liegen, wenn ein Job scheitert? Wird der Inhaltstyp geprüft oder nur der behauptete?
> 4. **Datenabfluss in Logs.** Erscheint Quelltext, eine Frage oder eine Antwort irgendwo in einem Log, in usage_log oder in einer Fehlerantwort? Prüfe besonders backend/app/common/middleware/error.middleware.ts und backend/app/services/usage-log/index.ts.
> 5. **Ressourcen.** Kann jemand mit einer Anfrage den Worker oder den Speicher überlasten? Greifen die Kappungen aus docs/SPEC.md (50 Quellen, 20 MB, 150.000 Token) auf jedem Weg?
> 6. **Secrets.** Steht irgendwo ein Schlüssel, ein Passwort oder ein Verbindungsstring im Klartext, im Log oder in einer Antwort?
>
> Melde je Fund: Datei:Zeile, was passieren kann, und wie schwer es wiegt (kritisch/hoch/mittel/niedrig). Keine Stilfragen, keine Vorschläge zu Formatierung. Wenn du nichts findest, sag das ausdrücklich statt etwas zu erfinden.

## Ergebnis

## Sicherheitsprüfung M2 (27cf669~1..HEAD)

Geprüfte Commits: `27cf669`, `f7697ab`, `bdd7e39`, `ee1dd22`, `f54fe43` (plus `44ed3b0` CI). Gelesen: CLAUDE.md, SECURITY.md §7, docs/SPEC.md, docs/PLAN.md M2.

### 1. Zugriffskontrolle

Kein Bypass gefunden. `NotebooksService.readable/writable` (`/Users/7style/Projects/quellwerk/backend/app/modules/notebooks/services/notebooks.service.ts:33-52`) nimmt die Session-Id als Pflichtparameter, es gibt keinen Lesepfad ohne sie, beide Fehlerfälle enden in derselben `NotebookNotFoundError` (404, `internal/errors.ts`), und der Sources-Pfad fragt dieselbe Funktion über die injizierte `NotebookAccess` (`modules/index.ts:80-83`). Die Tests decken 404-statt-403 für fremde und nicht existierende Ids ab (`notebooks.test.ts:154,167`, `sources.routes.test.ts:326,335`), inklusive „Refusal vor dem Kapazitäts-Gate", also ohne Größen-Orakel. `sessionId` steht in keiner Antwort (`notebook.dto.ts:47-57`, Test `notebooks.test.ts:89`).

**Funde:**

1. **`/Users/7style/Projects/quellwerk/backend/app/modules/sources/services/sources.service.ts:70-73`** — `list()` ruft `notebooks.writable()`. Das Demo-Notizbuch hat `sessionId: null` (`backend/prisma/seed.ts:91`), also liefert `GET /api/notebooks/demo/sources` für **jede** Session 404, während `GET /api/notebooks/demo` 200 liefert. Zu streng, kein Leck, aber der Demo-Pfad aus docs/SPEC.md („für alle lesbar") ist damit halb tot. **niedrig** (funktional, kein Sicherheitsrisiko).
2. **`/Users/7style/Projects/quellwerk/backend/app/modules/session/internal/session.middleware.ts:37-58`** — kein `regenerate()` an irgendeiner Stelle. Wer ein Opfer dazu bringt, ein vom Angreifer besorgtes (gültig signiertes) Cookie zu benutzen, liest dessen spätere Notizbücher mit. Ohne Cookie-Setz-Primitive (kein Session-Parameter in der URL, `httpOnly`, `sameSite=lax`) ist das schwer auszulösen; auf einem Server mit Nachbarseiten auf Geschwisterdomains ist es nicht null. **niedrig**.

### 2. Prompt-Injection

Quelltext geht ausschließlich in Dokumentblöcke (`adapters/llm/documents.ts:90-96`), der Dateiname nur in das `title`-Feld desselben Blocks und dort über `oneLine()` (`documents.ts:63`), das jeden Zeilenumbruch einebnet — ein Dateiname kann keine Struktur öffnen. Alle drei Prompts sagen ausdrücklich, dass der Inhalt Daten ist. `{{{raw}}}` wird von keinem M2-Aufrufer benutzt. Die Winkelzeichen-Ersetzung greift in `render.ts:87-91` für jeden `{{value}}`.

**Funde:**

3. **`/Users/7style/Projects/quellwerk/prompts/notebook-title.md:25` und `/Users/7style/Projects/quellwerk/prompts/notebook-overview.md:35`, gespeist aus `/Users/7style/Projects/quellwerk/backend/app/worker.ts:261,309`** — `{{language}}` ist kein Serverwert, sondern Modellausgabe aus dem Source Guide, und die stammt aus dem hochgeladenen Dokument. Das Schema dafür ist `language: z.string()` ohne jede Einschränkung (`modules/sources/internal/ingest.job.ts:72`); `languageOf()` (`worker.ts:124-142`) reicht die Zeichenkette unverändert weiter. Ein präpariertes Dokument kann so beliebigen Text in den Instruktionsblock des Folgeaufrufs schreiben (Winkelzeichen escaped, Zeilenumbrüche und Prosa nicht). Wirkung bleibt im eigenen Notizbuch (Titel, Emoji, Overview), aber es ist der einzige Kanal in M2, über den Quellinhalt in einen Anweisungsteil gelangt. Gegenmittel wäre eine Allowlist oder `z.string().max(40)` plus Prüfung in Code. **mittel**.
4. **`/Users/7style/Projects/quellwerk/backend/app/services/prompt-loader/render.ts:93-94`** — die Leftover-Prüfung läuft über die **fertig substituierte** Ausgabe. Enthält ein eingesetzter Wert `{{`, wirft `UnrenderedPlaceholderError` mit 40 Zeichen des gerenderten Prompts in der Message. Über Fund 3 ist dieser Wert fremdbeeinflussbar; die Message landet danach über `reasonFor` in `source.error` und im Log (siehe Fund 10). **niedrig**.

### 3. Upload

Kein Path-Traversal: multer schreibt mit `dest` unter zufälligem Namen, `originalname` wird nur für den Titel benutzt (`sources.controller.ts:59,84-88`) und als Datenfeld gespeichert; der gespeicherte Pfad ist immer `file.path` (`sources.controller.ts:63`).

**Funde:**

5. **`/Users/7style/Projects/quellwerk/backend/app/modules/sources/controllers/sources.controller.ts:49-54` und `/Users/7style/Projects/quellwerk/backend/app/adapters/storage/local-file-storage.ts:19-21`** — eine abgelehnte Datei bleibt liegen. multer räumt nur eigene Fehler ab (`LIMIT_FILE_SIZE`); alles, was der Handler danach ablehnt — 415 unbekannter Typ (`controller.ts:51`), 413 volles Notizbuch (`sources.service.ts:136`), 404 fremdes Notizbuch, 400 ohne Session —, hinterlässt bis zu 20 MB im `UPLOAD_DIR` ohne DB-Zeile. Es gibt im ganzen Backend kein `unlink`; `LocalFileStorage.remove` ist ein Stub, der wirft. Auch erfolgreich ingestierte Dateien werden nach der Extraktion nie gelöscht, und der geplante Aufräumjob (M7-T5) läuft über Notizbücher, sieht also die Waisen gar nicht. Ergebnis: jeder anonyme Nutzer kann die Platte in Schleife füllen. **hoch**.
6. **`/Users/7style/Projects/quellwerk/backend/app/common/middleware/upload.middleware.ts:29-34`** — von den in SECURITY.md 7.4 zugesagten Limits sind nur `fileSize` und `files` gesetzt. `fields`, `parts`, `fieldSize`, `fieldNameSize` fehlen; multers Defaults sind `Infinity` für Felder und Teile bei 1 MB je Feld. Ein Multipart-Body mit tausenden Textfeldern wird vollständig im Speicher des API-Prozesses gepuffert. **mittel**.
7. **`/Users/7style/Projects/quellwerk/backend/app/common/middleware/upload.middleware.ts:11-14`, `sources.controller.ts:17-22`** — geprüft wird nur der behauptete Content-Type. Er entscheidet, welcher Parser im Worker auf die Bytes losgeht. Als M7-T3 dokumentiert und im Kommentar offengelegt; solange M2 aber deployed ist, ist das die aktive Lage. **mittel**.
8. **`/Users/7style/Projects/quellwerk/backend/app/adapters/storage/local-file-storage.ts:1-22`** — Kopf sagt „Implementation arrives with the upload route in M2-T1", M2-T1 ist in docs/PLAN.md:221 als `[x]` abgehakt, der Adapter ist nie gebaut worden, und damit gibt es die von SECURITY.md 7.4 zugesagte `safePath`-Prüfung nirgends. Heute harmlos (der Pfad kommt aus multer), aber der Worker liest blind, was in `storage_path` steht (`worker.ts:202`). **niedrig heute, mittel als Zusage-Lücke**.

### 4. Datenabfluss in Logs

`usage_log` ist sauber: `services/usage-log/index.ts:75-92` schreibt ausschließlich Ids, Zähler, Preis, Latenz, `stop_reason`; der Fehlerpfad (Z. 94-98) loggt Route, Modell, Kosten und sonst nichts. Die Antwort-DTOs geben keinen Quelltext heraus (`source.dto.ts:49-67`, Test `sources.routes.test.ts:152`). morgan schneidet den Query-String ab (`app.ts:15-19`).

**Funde:**

9. **`/Users/7style/Projects/quellwerk/backend/app/modules/sources/internal/ingest.job.ts:270`** — `return error instanceof Error ? error.message : 'unknown error'` reicht jede fremde Fehlermeldung ungefiltert weiter: in `source.error` (DB), von dort in die API-Antwort (`source.dto.ts:62`) und in das Worker-Log (`worker.ts:342`, `...result` enthält `reason`). Der gefährliche Fall ist eine Prisma-Fehlermeldung aus `updateSource`, deren `data` genau den normalisierten Quelltext trägt. Das verletzt die Regel „Source text never reaches logs, error responses" aus CLAUDE.md direkt. **mittel**.
10. **`/Users/7style/Projects/quellwerk/backend/app/common/middleware/error.middleware.ts:15-22, 83-95, 149`** — `isModuleException` verlangt `statusCode` **und** `errorCode`/`code`. Die Fehler von `express.json` (http-errors) tragen `statusCode`, `status` und `type`, aber kein `code`: ein Body über 2 MB fällt deshalb auf den Default durch, wird als 500 mit vollem Stack geloggt (Z. 88) und antwortet außerhalb von Produktion mit der rohen Message (Z. 149). Passend dazu erlaubt das Paste-Schema 1.000.000 Zeichen (`source.dto.ts:21`), was bei mehrbyte-Text sicher über dem 2-MB-Limit aus `app.ts:77` liegt — der reguläre Weg endet also in einem 500 statt in einem 413. **mittel**.
11. **`/Users/7style/Projects/quellwerk/backend/app/common/utils/logger.util.ts:221`** — jede Request-Zeile trägt die Session-Id, also den Redis-Schlüssel der Session. SECURITY.md 7.5 erlaubt „IDs"; ohne `SESSION_SECRET` ist daraus kein Cookie zu bauen. **niedrig, kein Handlungsbedarf**.

### 5. Ressourcen

**Funde:**

12. **`/Users/7style/Projects/quellwerk/backend/app/config/rate-limit.config.ts:28-32`** — der Schlüssel ist `${ip}:${sessionId}`, und `req.session.id` wird von express-session für **jede Anfrage ohne Cookie neu erzeugt** (`saveUninitialized:false` verhindert nur das Speichern, nicht das Erzeugen). Ein Skript, das das Cookie einfach nie zurückschickt, bekommt pro Request einen eigenen Zähler-Bucket: der einzige aktive Limiter (`app.ts:74`) greift damit überhaupt nicht. Der Kommentar in Z. 24-27 beschreibt das Gegenteil dessen, was der Code tut. **kritisch**, weil darauf alle weiteren Limiter aufsetzen sollen.
13. **`/Users/7style/Projects/quellwerk/backend/app/config/rate-limit.config.ts:76-81` vs. `app.ts:74`** — `rateLimitConfig.sources` (20/Stunde/Session, SPEC-Zahl) ist definiert und wird an keiner Route montiert. Die Source-Route hängt allein am `general`-Limiter (300/15 min), der nach Fund 12 nicht greift. **hoch**.
14. **`/Users/7style/Projects/quellwerk/backend/app/services/quota/index.ts:14-16`** — `assertBudgetLeft` wirft „arrives in M7-T2", und keine Route und kein Job ruft irgendetwas Budgetartiges auf. M2 hat aber genau den Pfad geöffnet, der Geld ausgibt: pro Quelle ein Guide- und ggf. ein Titel-Call, dazu die Overview auf `MODEL_CHAT` **mit** Effort über alle Quellen (`worker.ts:303-312`). Zusammen mit 12 und 13 ist die Ausgabenseite für einen anonymen Aufrufer unbegrenzt; `DAILY_SPEND_CAP_CENTS` ist reine Deko. CLAUDE.md verlangt „jede Route ruft zuerst den Quota-Service". **hoch**.
15. **`/Users/7style/Projects/quellwerk/backend/app/modules/sources/services/sources.service.ts:81-121` mit `internal/prisma.repository.ts:30-60`** — `countByNotebook`/`tokenCount` lesen, dann `create`: kein `$transaction`, keine Sperre. n gleichzeitige Requests passieren alle dasselbe Gate; die 50 Quellen und die 150.000 Token sind parallel überschreitbar (der `increment` in Z. 70-78 ist atomar, die Entscheidung davor nicht). Damit ist auch die spätere Chat-Kontextgröße nicht garantiert. **mittel**.
16. **`/Users/7style/Projects/quellwerk/backend/app/modules/sources/internal/extract.ts:152-169` und `:177-181`** — die PDF-Schleife läuft über `doc.numPages` ohne Seiten-, Zeit- oder Zeichenobergrenze, und `mammoth.extractRawText` entpackt ein docx ohne Dekompressionsgrenze. Die 20-MB-Kappe begrenzt die Eingabe, nicht den Speicher: eine Zip-Bombe oder ein PDF mit sehr vielen Seiten bringt den Worker um. Bei `concurrency = 2` (`services/queue/index.ts:133`) und ohne Job-Timeout blockieren zwei solche Dateien die gesamte Ingest-Queue; ein OOM lässt alle laufenden Quellen auf `processing` stehen, und einen Reaper für abgestandene Jobs gibt es erst in M7. Das ist zugleich der „Spinner, der nicht endet" aus docs/SPEC.md. **mittel bis hoch**.
17. **`/Users/7style/Projects/quellwerk/backend/app/modules/sources/services/sources.service.ts:102`** — `countTextTokens` schickt bis zu 1.000.000 Zeichen an die Anthropic-API, bevor das Token-Gate überhaupt eine Zahl hat. Unvermeidbar in dieser Reihenfolge, aber ohne funktionierenden Limiter (Fund 12) eine kostenlose Verstärkung nach außen. **niedrig für sich, mittel in Kombination**.

### 6. Secrets

Nichts gefunden. Der API-Schlüssel wird nur in `adapters/llm/anthropic.adapter.ts:21` aus `env` gelesen und nirgends geloggt; `usage_log` speichert keine Credentials; der neue CI-Job (`.github/workflows/ci.yml`) baut nur Images, pusht nichts und injiziert keine Secrets; `backend/example.env` enthält Platzhalter. `app.ts:108-121` loggt bei `/health` die Fehlermeldung von Prisma bzw. ioredis — die enthält Host und ggf. Benutzer, kein Passwort. **kein Handlungsbedarf**.

---

### Die drei Funde, die ich zuerst beheben würde

1. **Fund 12, `/Users/7style/Projects/quellwerk/backend/app/config/rate-limit.config.ts:30`.** Eine Zeile, und sie hebelt den gesamten Missbrauchsschutz aus: wer kein Cookie zurückschickt, wird nie limitiert. Alles, was M7 an Limitern darauf bauen soll, erbt den Fehler. Die Session gehört nur dann in den Schlüssel, wenn sie aus einem gültigen Cookie kam (`req.sessionID` gegen `req.session.createdAt` prüfen, sonst reine IP).

2. **Fund 14 zusammen mit 13, `/Users/7style/Projects/quellwerk/backend/app/services/quota/index.ts:14` und `app.ts:74`.** M2 hat die Ausgabenseite aufgemacht, aber die Bremse steht als werfender Stub in M7. Bis dahin kann ein anonymer Aufrufer beliebig viele Modellaufrufe auslösen, darunter Overview-Läufe auf `MODEL_CHAT` über ein ganzes Notizbuch. Mindestens den `sources`-Limiter montieren und die Ingest-Enqueue gegen die Tagessumme aus `usage_log` prüfen — die Tabelle existiert seit diesem Meilenstein, die Abfrage ist eine Zeile.

3. **Fund 5, `/Users/7style/Projects/quellwerk/backend/app/modules/sources/controllers/sources.controller.ts` / `adapters/storage/local-file-storage.ts:19`.** Jede abgelehnte Datei bleibt für immer liegen, und niemand räumt sie je auf, auch der geplante 7-Tage-Job nicht. Auf einem selbst betriebenen Server mit Nachbarn ist eine volle Platte kein Schönheitsfehler. Ein `finally`-Unlink im Controller für jeden Pfad, der die Datei nicht in eine Zeile überführt, plus das Löschen nach erfolgreicher Extraktion im Ingest-Job.

Knapp dahinter: Fund 16 (Extraktion ohne Schranken) killt in der Demo den Worker, und Fund 9 verletzt eine ausdrücklich als nicht verhandelbar markierte Regel aus CLAUDE.md.

