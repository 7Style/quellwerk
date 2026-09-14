# Security review of M4

Subagent-Lauf `reviewer`, 73 Werkzeugaufrufe.
Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist
Werkzeugausgabe (siehe [README.md](../README.md)).

## Auftrag

> Sicherheitsprüfung zum Abschluss von Meilenstein M4 (die gesamte Oberfläche plus drei neue Backend-Routen).
>
> Repository: /Users/7style/Projects/quellwerk
>
> Der Bereich ist `git diff 3026bc2..HEAD`, acht Commits von 74ebcb0 bis 60275ff. Was M4 hinzugefügt hat:
>
> **Backend, neu:**
> - `GET /api/notebooks/:notebookId/sources/:sourceId/text` liefert den gespeicherten Quelltext (sources-Modul)
> - `GET /api/notebooks/:notebookId/messages` liefert den Verlauf (chat-Modul)
> - `sourceCount` in der Notizbuch-Antwort, gezählt per Prisma `_count`
> - `SourcesService.list` prüft jetzt mit `readable` statt `writable`
> - `refused` als berechnetes Feld an der Nachricht und im SSE-`done`-Ereignis
>
> **Frontend, komplett neu:**
> - `frontend/src/lib/api.ts` (RTK Query, `credentials: 'include'`, kein Token mehr)
> - `frontend/src/modules/*/services/*.api.ts` (notebooks, sources, chat)
> - `frontend/src/modules/chat/hooks/useChatStream.ts` (SSE über fetch, eigener Parser)
> - `frontend/src/app/n/[id]/NotebookWorkspace.tsx`, `frontend/src/app/dev/states/*`
> - alle Komponenten unter `frontend/src/modules/{shell,notebooks,sources,chat}`
>
> Prüfe gegen docs/SPEC.md, SECURITY.md und CLAUDE.md. Suche gezielt nach:
>
> 1. **Autorisierung an den beiden neuen Routen.** Kann eine Quelle oder ein Verlauf einer fremden Sitzung gelesen werden? Der Wechsel von `writable` auf `readable` beim Auflisten: öffnet der mehr, als er soll? Was passiert beim Demo-Notizbuch?
> 2. **Quelltext im Browser.** Der Text geht jetzt an den Client. Landet er irgendwo, wo er nicht hingehört — Cache-Header, localStorage, Redux-DevTools-Serialisierung, Fehlermeldungen, Logs?
> 3. **Der SSE-Client.** Abbruch und Aufräumen, ein Turn der beim Verlassen der Seite weiterläuft, mehrere gleichzeitige Turns, ein Parser, den eine bösartige oder kaputte Antwort aus dem Tritt bringt.
> 4. **Prompt-Injection über die Oberfläche.** Quelltitel, Notizbuchtitel, Antworttext und Zitattext werden gerendert. Kann daraus Markup oder ein Skript werden? Der Quelltext kommt aus einer hochgeladenen Datei.
> 5. **Die Dev-Oberfläche `/dev/states`.** Sie ist auf `DEV_STATES` gesperrt. Gibt es einen Weg daran vorbei?
> 6. **CORS und Cookie.** `credentials: 'include'` gegen die Allowlist des Backends, SameSite, Secure.
> 7. **Fehlerpfade.** Sagt eine Fehlermeldung im Frontend mehr, als sie darf? Gibt es einen Zustand ohne Ausweg, also einen Spinner, der nicht endet?
>
> Melde jeden Fund mit Datei, Zeile, Schweregrad (kritisch/hoch/mittel/niedrig) und einem konkreten Szenario. Keine Stilfragen. Wenn du nichts findest, sag das ausdrücklich und nenne, was du geprüft hast.

## Ergebnis

## Prüfbericht M4 — `git diff 3026bc2..HEAD`

Geprüft: die drei neuen Backend-Routen samt Zugriffspfad (`sources.service`, `wiring/chat.loadMessages`, `notebooks.service.readable/writable`, `chatAccess`), CORS- und Session-Konfiguration, das Fehler-Middleware-Verhalten, der gesamte neue Frontend-Baum, der SSE-Client, die Dev-Oberfläche und ihr Gate, die e2e-Suite und die CI-Verdrahtung.

### Zu den sieben Fragen vorab

**1. Autorisierung der neuen Routen — kein Fund.** `GET .../sources/:sourceId/text` führt beide IDs in der WHERE-Klausel (`/Users/7style/Projects/quellwerk/backend/app/modules/sources/internal/prisma.repository.ts:35`), davor steht `readable`, und es gibt Tests für fremdes Notizbuch, fremde Quelle und fehlende Session. `GET .../messages` benutzt dieselbe Entscheidung wie ein Turn (`chatAccess`) und gibt für ein geteiltes Notizbuch `[]` zurück (`/Users/7style/Projects/quellwerk/backend/app/wiring/chat.ts:320`) — eine Besucherin sieht die Fragen der vorigen nicht. Der Wechsel `writable` → `readable` öffnet genau eine Sache mehr, nämlich das Demo-Notizbuch, und das ist SECURITY.md 7.2. Schreibpfade (`addPasted`, Upload) stehen unverändert auf `writable`, das Demo bleibt also schreibgeschützt.

**2. Quelltext im Browser — kein Fund.** `Cache-Control: no-store` auf beiden neuen Routen und ein Test dafür; kein `localStorage`/`sessionStorage` ausser der Theme-Präferenz; `configureStore` ohne explizites `devTools`, also im Produktionsbuild aus; die Antwort trägt weder `storagePath` noch `originalName`; `source.error` ist seit M2 eine kuratierte Meldung, nie `error.message`. Kein `dangerouslySetInnerHTML` irgendwo.

**3. SSE-Client** — siehe Fund 2, 6, 8.

**4. Prompt-Injection über die Oberfläche — kein Fund.** Quelltitel, Notizbuchtitel, Antwort- und Zitattext landen ausschliesslich als React-Textknoten (`SourcePassage.tsx:53-65`, `Answer.tsx:59-82`, `CitationChip.tsx:50-55`). M4 hat keinen neuen Weg in einen Prompt gebaut; Frage und Antwort gehen weiterhin nur durch `renderPrompt`.

**5. `/dev/states`** — das Gate selbst ist richtig gebaut (Request-Zeit, `force-dynamic`, `notFound()`), aber siehe Fund 4 und 9.

**6. CORS und Cookie — kein Fund.** Keine Wildcard, `credentials` nur bei gelistetem Origin (`cors.config.ts:60-68`), `httpOnly`, `sameSite=lax`, `secure` in Produktion. In Produktion ist `NEXT_PUBLIC_API_URL=https://${PROD_DOMAIN}`, also same-origin; lokal 3010/3011, also same-site — `lax` trägt in beiden Fällen.

**7. Fehlerpfade** — siehe Fund 1, 3, 6.

---

## Funde

**1. Upload und eingefügter Text scheitern lautlos. Schweregrad: hoch.**
`/Users/7style/Projects/quellwerk/frontend/src/app/n/[id]/NotebookWorkspace.tsx:71-72` und `:124-127`. Beide Mutationen werden ohne ihren Zustand destrukturiert (`const [addPaste] = ...`) und mit `void` ausgelöst. RTK Query lehnt bei einem HTTP-Fehler nicht ab, sondern liefert `{ error }` — das wird verworfen. Es gibt in `SourcesPanel`/`AddSourcesDialog` keine einzige Stelle, die einen Fehler einer Mutation zeigt.
Szenario: Eine 25-MB-PDF wird in den Dialog gezogen. Das Backend antwortet 413 mit der fertig formulierten Meldung `That file is larger than 20 MB.` Der Dialog schliesst, die Liste bleibt wie sie war, es erscheint nichts. Dasselbe für 415 (falscher Typ), 429 (20 Quellen pro Stunde — beim Ablegen von zehn Dateien gleichzeitig realistisch) und für das Notizbuch-Token-Limit. Das verletzt die M4-Zusage in `docs/PLAN.md:315` ("Every task here handles loading, error, empty and success for its own panel").

**2. Eine Frage, die direkt nach der Antwort abgeschickt wird, verschwindet spurlos. Schweregrad: hoch.**
`/Users/7style/Projects/quellwerk/frontend/src/modules/chat/hooks/useChatStream.ts:103` (`if (running.current) return;`) zusammen mit `:232` (`case 'done': setState('idle')`) und `/Users/7style/Projects/quellwerk/frontend/src/modules/chat/components/Composer.tsx:47-52`.
Der Server schickt `done` absichtlich **vor** den Follow-ups, dann läuft noch ein zweiter Modellaufruf auf `MODEL_FAST` und erst danach schliesst der Stream. In diesem Fenster (ein bis drei Sekunden) ist `state === 'idle'`, also ist `busy` falsch, also lässt der Composer senden und leert das Feld — aber `running.current` zeigt noch auf den alten Controller, und `ask` kehrt wortlos zurück. Die getippte Frage ist weg, ohne Meldung, ohne Spinner, ohne Fehler. Wer im Demo-Video zügig weiterfragt, trifft das.

**3. Eine hängengebliebene Quelle pollt bis in alle Ewigkeit. Schweregrad: mittel.**
`/Users/7style/Projects/quellwerk/frontend/src/app/n/[id]/NotebookWorkspace.tsx:49-58` pollt alle zwei Sekunden, solange irgendeine Zeile `queued` ist. `/Users/7style/Projects/quellwerk/frontend/src/modules/sources/components/SourceItem.tsx:44` zeigt dann dauerhaft "Waiting to be read". Der Sweeper über den `(status, heartbeatAt)`-Index, der so eine Zeile terminal machen würde, kommt laut `/Users/7style/Projects/quellwerk/backend/app/worker.ts:14` erst in M7-T5.
Szenario: Der Worker-Container ist beim Deploy kurz unten oder der Job geht verloren. Die Quelle bleibt `queued`, die Oberfläche fragt die Liste unbegrenzt alle zwei Sekunden ab und sagt nie, dass etwas nicht stimmt. Es gibt weder eine Obergrenze für die Polling-Dauer noch eine Meldung nach n Minuten — genau der Spinner, den `docs/PLAN.md:315` ausschliesst.

**4. Der Beweis, dass `/dev/states` in Produktion 404 ist, läuft in CI nicht. Schweregrad: mittel.**
`/Users/7style/Projects/quellwerk/e2e/tests/ui/smoke.spec.ts:107` überspringt den Test, sobald `BASE_URL` gesetzt ist. `/Users/7style/Projects/quellwerk/.github/workflows/ci.yml` setzt seit diesem Bereich genau das (`BASE_URL: http://127.0.0.1:3010`) und schreibt zugleich `DEV_STATES=1` in die Compose-Env. In der Pipeline existiert also nur der Server, der den Katalog *zeigt*; die Hälfte der Behauptung, die auf dem Server zählt, wird nie ausgeführt. `docs/PLAN.md:356` führt "which is 404 in a production build" als abgehaktes Ergebnis.
Dazu passend: `/Users/7style/Projects/quellwerk/scripts/security-check.sh` prüft `DEV_STATES` nur in Dateien unter `deployment/prod/`. Das ist heute korrekt (die Prod-Compose reicht die Variable nicht durch, der Frontend-Service hat einen expliziten `environment:`-Block ohne `env_file`), aber die Prüfung deckt die Wurzel-`docker-compose.yml` nicht ab, die die Variable seit diesem Bereich durchreicht.

**5. M4-T2 ist abgehakt, seine Erwartung beschreibt eine entfernte Funktion. Schweregrad: mittel.**
`/Users/7style/Projects/quellwerk/docs/PLAN.md:335-341`. Goal und Expected nennen weiterhin "selection" und "select all toggles all". Commit `ee50a8c` hat die Häkchen bewusst entfernt, `docs/KNOWN-LIMITS.md` wurde nachgezogen, `SourcesPanel.tsx:30-34` erklärt die Entscheidung — nur der PLAN-Eintrag nicht. Das angegebene Testkommando kann die angegebene Erwartung nicht erfüllen; `e2e/tests/ui/sources.spec.ts` prüft etwas anderes. Der PLAN ist laut CLAUDE.md Teil des Deliverables, und ein Haken über einer Erwartung, die niemand mehr erfüllen kann, ist genau die Sorte Beleg, die ein Prüfer aufmacht.

**6. M4-T6 ist abgehakt, das angegebene Kommando überspringt sich selbst. Schweregrad: mittel.**
`/Users/7style/Projects/quellwerk/docs/PLAN.md:359-366` nennt als Test `playwright test tests/e2e/notebook.spec.ts`. `/Users/7style/Projects/quellwerk/e2e/tests/e2e/notebook.spec.ts:38` ruft `test.skip(!process.env.E2E_STACK, ...)`. Wer das Kommando so tippt, wie es im PLAN steht, bekommt "skipped" und keinen grünen Lauf. Die Begründung (kein brauchbarer Key in CI) ist richtig, aber dann gehört `E2E_STACK=1 BASE_URL=...` in die Testzeile des PLAN, sonst steht dort ein Haken über einem Kommando, das nichts prüft.

**7. Abgebrochene Turns erzeugen keine `usage_log`-Zeile — das Tagesbudget ist damit nur noch beratend. Schweregrad: mittel.**
`/Users/7style/Projects/quellwerk/backend/app/modules/chat/services/chat.service.ts:135` (`return { status: 'aborted' }` vor `recordUsage`). In `docs/KNOWN-LIMITS.md` in diesem Bereich offen dokumentiert — das rechne ich hoch an, es bleibt trotzdem eine Kontrolle aus SECURITY.md 7.3, die umgangen werden kann. Szenario: ein Skript öffnet einen Turn, wartet zwei Sekunden und schliesst die Verbindung. Der Prefix mit dem ganzen Notizbuch ist bei Anthropic bezahlt, `usage_log` bleibt leer, `assertBudgetLeft` sieht nichts. Begrenzt wird das nur durch `chatPerIp` (60/Stunde) — Sessions sind gratis. Für eine öffentliche Demo mit hinterlegter Kreditkarte ist das die relevanteste offene Flanke.

**8. Der SSE-Parser wirft bei einem kaputten Frame den Rest des Streams weg. Schweregrad: niedrig.**
`/Users/7style/Projects/quellwerk/frontend/src/modules/chat/hooks/useChatStream.ts:159`: `apply(JSON.parse(line.slice(5).trim()) as ChatEvent)` ohne Schutz. Ein einziges unvollständiges oder von einem Proxy verstümmeltes `data:` lässt `JSON.parse` werfen, die Exception verlässt die Leseschleife und landet im generischen `catch`, das "The connection to the server was lost" zeigt — obwohl die Antwort vielleicht zu neunzig Prozent korrekt angekommen war und der Rest noch unterwegs ist. Ein `try/catch` um die eine Zeile, das den Frame überspringt, hält den Turn am Leben. Zweitens ist der `apply`-`switch` nicht gegen ein unbekanntes `t` abgesichert — das ist heute harmlos (kein `default`), aber ein Server, der ein Feld umbenennt, führt zu einer Antwort, die stumm nichts tut.

**9. Fixtures und ein Fixture-Helfer werden aus den Produktionsbarrels exportiert. Schweregrad: niedrig.**
`/Users/7style/Projects/quellwerk/frontend/src/modules/sources/index.ts:18` exportiert `sourceTextFixtures`, und `/Users/7style/Projects/quellwerk/frontend/src/lib/citation.ts:49` enthält `citeQuote`, im Kommentar ausdrücklich "For fixtures only". Beide Barrels werden von `NotebookWorkspace` importiert. Tree-Shaking entfernt das heute vermutlich, aber es ist eine Annahme über den Bundler an einer Stelle, an der ein separater `fixtures`-Einstiegspunkt (nur von `/dev/states` importiert) die Frage gar nicht erst stellt.

**10. `useChatStream` ist nicht an das Notizbuch gebunden. Schweregrad: niedrig.**
`/Users/7style/Projects/quellwerk/frontend/src/modules/chat/hooks/useChatStream.ts:63` und `:74-79`: `messages` und die `historyApplied`-Ref überleben eine Änderung von `notebookId`; nur `ask` hat es in den Dependencies. Sollte React die Komponente bei einem Wechsel `/n/A` → `/n/B` einmal nicht neu einhängen (App Router hat das historisch unterschiedlich gehandhabt, und spätestens ein Notizbuch-Umschalter in M5 erzwingt es), zeigt die Oberfläche den Verlauf von A unter der URL von B. `<NotebookWorkspace key={id} .../>` in `/Users/7style/Projects/quellwerk/frontend/src/app/n/[id]/page.tsx:24` kostet nichts und schliesst es aus.
Verwandt, gleiche Zeilen: schlägt der Verlaufsabruf zuerst fehl, fragt die Nutzerin etwas, und lädt der Verlauf danach (`refetchOnReconnect`) doch noch, wird die gerade gespeicherte Antwort ein zweites Mal vorangestellt — dieselbe Antwort steht zweimal im Thread. Ein Abgleich über `id` beim Voranstellen genügt.

**11. Das Frontend liefert keine eigenen Sicherheitsheader, obwohl jetzt Quelltext im DOM steht. Schweregrad: niedrig (M7).**
`/Users/7style/Projects/quellwerk/frontend/next.config.ts` setzt keine `headers()`, und `/Users/7style/Projects/quellwerk/deployment/prod/nginx/quellwerk.conf` fügt in `location /` weder CSP noch `X-Frame-Options` hinzu. Helmet läuft nur auf der API. SECURITY.md 7.5 nennt die Next.js-Header als Sollzustand, M7 ist der geplante Zeitpunkt — ich erwähne es nur, weil sich mit M4 die Konsequenz geändert hat: ab jetzt liegen ganze Dokumente im DOM, und `frame-ancestors 'none'` ist die billigste Hälfte davon.

**12. `Connection "upgrade"` unbedingt gesetzt. Schweregrad: niedrig.**
`/Users/7style/Projects/quellwerk/deployment/prod/nginx/quellwerk.conf`, `location /`: `proxy_set_header Connection "upgrade";` steht fest, unabhängig von `$http_upgrade`. Jede normale Anfrage an das Frontend behauptet damit einen Protokollwechsel, den sie nicht will. Next.js verkraftet es, ein zwischengeschalteter Cache oder HTTP/2-Client nicht zwingend. Der übliche Weg ist eine `map $http_upgrade $connection_upgrade`. Der Block ist in diesem Bereich von auskommentiert auf scharf gestellt worden, deshalb steht er hier.

---

## Die drei, die ich zuerst beheben würde

1. **Fund 1 — der lautlose Upload-Fehler.** Er trifft die erste Handlung, die jeder Prüfer ausführt (Datei ablegen), er hat vier realistische Auslöser, und die Meldungen sind serverseitig bereits fertig formuliert. Es fehlt nur der Weg von der Mutation in die Oberfläche. Billigste Reparatur, grösster sichtbarer Schaden, wenn sie unterbleibt.

2. **Fund 2 — die verschwindende Frage.** Ein Produkt, das getippten Text ohne jede Meldung verwirft, verliert im Demo genau an der Stelle Vertrauen, an der es sie gewinnen will. Die Ursache ist eine Zeile: `busy` im Composer darf nicht `state`, sondern muss "ein Turn ist offen" spiegeln — entweder indem `ask` einen `busy`-Wert aus `running.current` mitliefert oder indem `done` den Zustand erst bei Streamende auf `idle` setzt.

3. **Fund 7 — das umgehbare Tagesbudget.** Die anderen Funde kosten Ruf, dieser kostet Geld, und zwar auf einem öffentlich erreichbaren Server mit hinterlegtem Key. Auch wenn die saubere Lösung (Deltas mitzählen) zu Recht in eine eigene Entscheidung ausgelagert ist: bis dahin gehört ein billiger Riegel davor, etwa eine `usage_log`-Zeile mit den bis zum Abbruch bekannten Input-Token — die sind gemessen, nicht geschätzt, denn der Prefix steht vor dem ersten Token fest.

