# Upgrade September 2026: Plan und Entscheidungen

Stand: 2026-09-09. Branch: `chore/upgrade-2026-09`. Dieses Dokument ist die Spezifikation
für die Umsetzung; jede Abweichung wird hier nachgetragen.

## Ziel

1. Alle Abhängigkeiten auf die neueste Version, die untereinander kompatibel und produktionsreif ist.
2. Dateien entfernen, die dem Boilerplate nicht gehören oder kaputt sind (Reste aus Kundenprojekten,
   tote Abhängigkeiten, nie installierte Paket-Attrappen, getrackte Build-Artefakte).
3. Sicherheitsbefunde aus dem Scan beheben, ohne die Architektur zu ändern.

Ausgangslage (Baseline vor dem Update): Backend-Typecheck rot (`user.controller.ts`, DTOs als
Typen importiert und als Werte benutzt), Jest-Config zeigt auf zwei nicht existierende Dateien,
Frontend-Build rot (`useWorkflowGeneration.ts` importiert `@/components/Json2N8n/types`, das es
nicht gibt), beide Produktions-Dockerfiles kaputt (falscher CMD-Entrypoint, `COPY prisma/migrations`
ohne Verzeichnis, `output: 'standalone'` fehlt), Husky-Hooks nicht aktiv und mit Pipefail-Bug.

## Versionsmatrix (verbindlich, exakt gepinnt wo angegeben)

| Bereich | Paket | Von | Nach | Grund / Hinweis |
|---|---|---|---|---|
| Laufzeit | Node | 20 (EOL) | **24** (`.nvmrc` 24, engines `>=24`) | Aktives LTS bis 2028; Node 26 erst nach LTS am 28.10.2026 |
| Laufzeit | Docker Backend | node:20-bookworm-slim | **node:24-bookworm-slim** | |
| Laufzeit | Docker Frontend | node:20-alpine | **node:24-alpine** | |
| Werkzeug | pnpm | 10.11 (nur Frontend) | **11.26.0**, Workspace am Root | `packageManager` exakt; Corepack ab Node 25 nicht mehr dabei, deshalb `npm i -g pnpm@11.26.0` in Docker/CI |
| Werkzeug | TypeScript | 5.9 | **6.0.3** (exakt, Catalog) | 7.0.2 hat keine JS-API: typescript-eslint (`<6.1`) und ts-jest (`<7`) lehnen ab. Wiedervorlage bei TS 7.1 |
| Werkzeug | @types/node | 20/22 | **24.13.3** (Catalog) | passend zur Laufzeit |
| Werkzeug | ESLint Backend | 8 (.eslintrc) | **10.10.0** + typescript-eslint 8.70.0 + @eslint/js 10 + globals | Flat Config, kein `--ext` |
| Werkzeug | ESLint Frontend | 9 | **9.39.5 (Hold)** + eslint-config-next 16.3.4 | eslint-plugin-react 7.37.5 (Abhängigkeit von eslint-config-next) stürzt auf ESLint 10 ab; vercel/next.js PR #91710 offen. Wiedervorlage |
| Werkzeug | Jest | 29 | **30.5.1** + ts-jest 29.4.12 + @jest/globals 30.5.1 | ESM-Preset über `createDefaultEsmPreset`, `tsconfig.test.json` |
| Werkzeug | supertest | 6 | **7.2.2** + @types/supertest 7.2.1 | Express-5-Typen |
| Werkzeug | tsx | 4.20 | **4.23.13** | |
| Werkzeug | Husky | nicht installiert | **9.1.7** im Root (`prepare: husky || true`) | Hooks werden dadurch erstmals aktiv |
| Werkzeug | Playwright | 1.49 | **1.63.0** | Node >=20; Browser neu laden |
| Backend | express | 4.21 | **5.2.1** + @types/express 5.0.6 | siehe Migrationsliste |
| Backend | prisma, @prisma/client | 6.19 | **7.10.0** (exakt) + @prisma/adapter-pg 7.10.0 | `prisma@latest` ist 8.0.0-rc, NIE ungepinnt installieren |
| Backend | redis (node-redis) | 4.7 (ungenutzt) | **6.2.1**, jetzt verdrahtet | Store für express-rate-limit |
| Backend | express-rate-limit | 7.5 | **8.7.0** | `max` -> `limit`, `ipKeyGenerator` |
| Backend | rate-limit-redis | 4.2 (ungenutzt) | **6.0.1**, jetzt verdrahtet | braucht express-rate-limit >= 8.6 |
| Backend | helmet | 7.2 | **8.3.0** | |
| Backend | zod | 3.25 | **4.5.4** | `.default` nach `transform`, `z.prettifyError`, `z.coerce`, `z.stringbool` |
| Backend | nodemailer | 6.10 | **10.0.1** (eigene Typen, @types/nodemailer entfernen) | |
| Backend | bcrypt | 5.1 | **6.0.0** + @types/bcrypt 6.0.0 | Prebuilds für glibc und musl, kein Build-Toolchain im Image |
| Backend | dotenv | 16 | **17.4.2** (`quiet: true`, nur eine Ladestelle) | |
| Backend | jsonwebtoken | 9.0.2 | **9.0.3** | |
| Backend | multer | 2.0 | **2.3.0**, @types/multer 2.2.0 nach devDependencies | |
| Backend | winston / -daily-rotate-file | 3.17 / 5.0 | **3.19.0** / 5.0.0 | |
| Backend | morgan, cors, compression | 1.10 / 2.8.5 / 1.8.1 | **1.12.0 / 2.8.6 / 1.8.1** | morgan 1.11+ schließt CVE-2026-5078 |
| Backend | speakeasy | 2.0 (2016, unmaintained) | **otpauth 9.5.2** | gleiche Base32-Secrets, RFC 6238 SHA1/30s/6 |
| Backend | qrcode | 1.5.4 | 1.5.4 (Hold) | |
| Backend | prettier | – | 3.9.6 | |
| Frontend | next | 16.0.5 | **16.3.4** | 16.0.5 hat die Sicherheitslücken von Mai/Juli/August 2026 |
| Frontend | react, react-dom | 19.2.0 | **19.2.8** (exakt) | CVE-2026-23870 |
| Frontend | @types/react, @types/react-dom | 19.2.x | **19.2.18 / 19.2.7** | |
| Frontend | tailwindcss, @tailwindcss/postcss | 4.1 | **4.3.3** | |
| Frontend | tailwind-merge | 3.4 | **3.6.0** | muss zur Tailwind-Minor passen |
| Frontend | lucide-react | 0.563 | **1.43.0** | 19 Marken-Icons entfernt; im Code heute keine Importe |
| Frontend | @reduxjs/toolkit, react-redux | 2.11 / 9.2 | **2.12.0 / 9.3.0** | `useSelector.withTypes` statt `TypedUseSelectorHook` |
| Frontend | react-hook-form | 7.66 (devDependencies!) | **7.87.0** in dependencies | wird zur Laufzeit importiert |
| Frontend | @radix-ui/react-label, -slot | 2.1.8 / 1.2.4 | **2.1.15 / 1.3.3** | |
| Frontend | prettier, prettier-plugin-tailwindcss | 3.7 / 0.7 | **3.9.6 / 0.8.1** (`tailwindStylesheet` setzen) | |
| Frontend | eslint-config-prettier | 10.1.8 | 10.1.8 (Hold) | 10.1.6/10.1.7 waren kompromittiert, nie darunter |
| Infra | postgres | 16-alpine | **17-alpine** | Major-Upgrade: bestehende Volumes brauchen pg_upgrade oder Dump/Restore; im Boilerplate sind Volumes frisch |
| Infra | redis | 7-alpine | **8-alpine** | |
| Infra | GitHub Actions | checkout@v4, build-push@v5, github-script@v7 | **checkout@v5, build-push@v6, github-script@v8**, setup-node@v4 | plus echte Prüf-Jobs |

## Entfernt (mit Grund)

Backend-Abhängigkeiten ohne einen einzigen Import: `class-validator`, `class-transformer`,
`reflect-metadata` (DTOs sind Interfaces, es gibt keinen Decorator), `uuid` + `@types/uuid`
(`node:crypto.randomUUID()`), `crypto-js` + Typen (eingestellt, node:crypto vorhanden), `dayjs`,
`express-validator`, `ts-node`, `ts-node-dev`, `express-session` + `@types/express-session`,
`connect-redis` (Auth ist JWT, keine Session; wird bei Bedarf in zwei Zeilen zurückgeholt),
`speakeasy` + Typen, `@types/nodemailer`, `swagger-jsdoc`, `swagger-ui-express` + Typen
(Spec wurde nie gemountet). `backend/public/` mit der statischen Doku-Seite ist in der
P4-Fix-Runde ebenfalls entfernt worden (Seite eines Kundenprojekts, siehe Nachträge P4).

Frontend: `autoprefixer` (Tailwind 4 macht das selbst), `sass` (keine .scss-Datei im Repo),
`jspdf` (ungenutzt, zehn Advisories 2026).

Dateien: `backend/app/modules/auth/{package.json,package-lock.json,tsconfig.json,jest.config.cjs,
fix-imports.sh,scripts/,example-usage.ts,INDEPENDENCE-REFACTORING.md}` (nie installierte
Paket-Attrappe, Prisma ^5 gepinnt, CJS-Skript in ESM-Paket, GNU-sed-Skript auf macOS);
die drei identischen `asyncHandler`-Kopien (Express 5 fängt abgelehnte Promises selbst);
`backend/app/common/utils/validation.util.ts`; `backend/app/services/location-finder/` samt
`GOOGLE_PLACES_*` (Google-Places-Rest aus einem Kundenprojekt); `backend/app/config/swagger.config.ts`;
Root-`tsconfig.json` (verwaist, `include` zeigt ins Leere); `frontend/src/hooks/useWorkflowGeneration.ts`,
`frontend/src/hooks/useNotifications.ts` (importieren ein Modul, das nicht existiert) und
`frontend/src/lib/json-formatting.ts`, falls danach ungenutzt; `backend/Dockerfile.test`
(läuft als root, CMD `npm run dev`; Tests laufen in CI).

## Arbeitspakete

### P0 Workspace (Root)

- `package.json` am Root: `private`, `packageManager: pnpm@11.26.0`, `engines.node >=24`,
  Skripte `dev` (docker compose up), `typecheck`, `lint`, `test`, `build`, `verify`
  (typecheck + lint + test), jeweils `pnpm -r run`, `prepare: husky || true`; devDependency husky 9.1.7.
- `pnpm-workspace.yaml`: `packages: [backend, frontend, e2e]`; `catalog` für typescript 6.0.3,
  @types/node 24.13.3, prettier 3.9.6; `allowBuilds` für bcrypt, @prisma/client, @prisma/engines,
  prisma, esbuild, sharp, @tailwindcss/oxide, unrs-resolver, @playwright/test (Liste mit
  `pnpm approve-builds` prüfen).
- Paketnamen: `bp-monolith-backend`, `bp-monolith-frontend`, `bp-monolith-e2e`.
- Backend: `pnpm import` aus `package-lock.json`, danach Lockfile löschen; ein `pnpm-lock.yaml` am Root.
- `.nvmrc` = 24. `.npmrc` nur falls nötig (Auth/Registry).
- Husky-Hooks: Shebang-Zeile raus, `npx`/`npm run` durch `pnpm --filter <pkg> exec` / `pnpm --filter <pkg> run`
  ersetzen, Pipefail-Bug beheben (Ausgabe in Variable, Exit-Code des eigentlichen Befehls prüfen),
  Sicherheitsprüfungen aus `scripts/security-check.sh` aufrufen statt duplizieren.
- Gate: `pnpm install --frozen-lockfile` am Root grün, `git config core.hooksPath` = `.husky/_`.

### P1 Backend

Reihenfolge: Werkzeuge -> Prisma 7 -> Express 5 -> Restliche Pakete -> Sicherheit -> Tests grün.

1. tsconfig: `module`/`moduleResolution` NodeNext, `target`/`lib` ES2024, `types: ["node"]`,
   `experimentalDecorators`/`emitDecoratorMetadata` raus, `useDefineForClassFields` bleibt false nur
   solange Controller Klassen-Properties als Handler nutzen (besser: Handler als Methoden oder Funktionen),
   veraltete `exclude`-Einträge raus. `tsconfig.test.json` mit `types: ["node","jest"]`.
2. ESLint 10 Flat Config (`eslint.config.mjs`) mit typescript-eslint `recommendedTypeChecked`,
   `projectService: true`, Tests mitlinten (globals.jest), `prisma/generated` und `app/generated` ignorieren.
3. Jest 30: `jest.config.mjs` mit `createDefaultEsmPreset({ tsconfig: '<rootDir>/tsconfig.test.json' })`,
   `setupFilesAfterEnv` nur mit existierenden Dateien, Testskript
   `node --experimental-vm-modules node_modules/jest/bin/jest.js --ci` (nie Watch-Modus im `test`-Skript).
   In Tests `import { jest, describe, it, expect } from '@jest/globals'`; `jest.mock('uuid')` entfällt mit uuid.
4. Prisma 7: Generator `prisma-client` mit `output = "../app/generated/prisma"`, `runtime = "nodejs"`,
   `moduleFormat = "esm"`, `importFileExtension = "js"`; `datasource` ohne `url`; `prisma.config.ts`
   mit `import 'dotenv/config'`, `datasource.url = env('DATABASE_URL')`, `migrations.seed = 'tsx prisma/seed.ts'`;
   Barrel `app/lib/prisma.ts` (PrismaPg-Adapter mit `max 10, connectionTimeoutMillis 5000, idleTimeoutMillis 300000`,
   Singleton, `$on`-Logging ohne `as any`, `export * from '../generated/prisma/client.js'`);
   alle 24 `@prisma/client`-Importe auf das Barrel; `auth.module.ts` und `prisma/seed.ts` bekommen den Adapter;
   `app/generated/` in `.gitignore` und ESLint-Ignores; **erste Migration erzeugen**
   (`prisma migrate dev --name init` gegen die Compose-Datenbank), `prisma/migrations/` einchecken;
   Skripte `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:seed` (= `prisma db seed`),
   `build = prisma generate && tsc -p .`; `prisma` als normale Dependency (Migrate im Produktions-Image).
5. Express 5: `app.listen(PORT, (err) => ...)`; `app.set('query parser', 'extended')` (Filter-Queries);
   `req.body ?? {}` an den 27 Lesestellen prüfen; `req.connection` -> `req.socket`; die drei asyncHandler
   löschen und ~56 Aufrufstellen auswickeln; `user.controller.ts` Handler als `async (req, res)`;
   `app/types/express.d.ts` als `declare global { namespace Express { ... } } export {}`;
   Error-Middleware bleibt 4-stellig, Rückgabetyp `void`.
6. express-rate-limit 8: `max` -> `limit` (9 Stellen), `keyGenerator` mit `ipKeyGenerator`, `standardHeaders: 'draft-8'`,
   Redis-Store (`rate-limit-redis`, eigener `prefix` je Limiter, `passOnStoreError: true` nur beim allgemeinen Limiter);
   Doppelzählung (globaler Limiter + Auth-Limiter auf `/api/auth`) auflösen; tote `skip`/`keyGenerator`-Schlüssel verdrahten oder entfernen;
   die ungenutzten Limiter-Konfigurationen (`api`, `upload`, `passwordReset`, `twoFactor`) an die passenden Routen hängen.
7. Redis-Client: `app/lib/redis.ts` (createClient({ url }), Pflicht-`error`-Listener, `connect()` beim Start,
   `close()` beim Shutdown), `/health` prüft Postgres und Redis; `redis.config.ts` auf node-redis-Form.
8. zod 4 + Konfiguration: `env.config.ts` wird die einzige Stelle, die `process.env` liest (`config/index.ts`
   und alle `*.config.ts` beziehen Werte von dort); Zahlen mit `z.coerce.number()`, Booleans mit `z.stringbool()`,
   Fehler mit `z.prettifyError`; DTOs der Module `users` und `audit-logs` als zod-Schemas (`*.schema.ts` + `z.infer`),
   `validateDto` durch `schema.parse` bzw. eine `validateBody(schema)`-Middleware ersetzen, `ZodError` -> 400 in der Error-Middleware.
9. Restliche Pakete laut Matrix; otpauth statt speakeasy (`TOTP.validate({ token, window: 1 })`, Secret.fromBase32);
   nodemailer 10 (`requireTLS: true` bei Port 587, `tls.minVersion 'TLSv1.2'`, kein Gmail-Default, ohne Host fehlschlagen);
   dotenv einmal, `quiet`.
10. Sicherheit (siehe Liste unten).
11. Gate: `pnpm --filter bp-monolith-backend exec prisma validate && prisma generate`, `tsc --noEmit` ohne Fehler,
    `eslint .` ohne Fehler, `jest --ci` grün (Tests, die tote Pfade prüften, werden angepasst, nicht gelöscht),
    `pnpm build` grün, Server startet gegen `docker compose up -d db redis` und `/health` liefert `healthy`
    mit `database: connected` und `redis: connected`; ein Smoke über `POST /api/auth/login` mit dem Seed-Admin.

### P2 Frontend und e2e

- Pakete laut Matrix; `react-hook-form` nach dependencies; `autoprefixer`, `sass`, `jspdf` raus; Reste löschen.
- `next.config.ts`: `output: 'standalone'`, `turbopack.root` behalten, `experimental.turbopackFileSystemCacheForBuild: false`.
- `tsconfig.json`: `target` ES2022, `lib` ohne `dom.iterable`; `.prettierrc` mit `tailwindStylesheet`; `lint: eslint .`, `typecheck: tsc --noEmit`, `format`.
- `src/store/hooks.ts`: `useSelector.withTypes<RootState>()`, `useDispatch.withTypes<AppDispatch>()`.
- `AGENTS.md`-Block, den `next dev` schreibt, einchecken.
- `frontend/public/robots.txt` anlegen (Dockerfile kopiert `public/`).
- e2e: Playwright 1.63.0, Skripte ohne `npx`, `types: ["node"]`; `webServer`-Block nicht nötig (BASE_URL bleibt).
- Gate: `tsc --noEmit`, `eslint .`, `next build` grün (Standalone-Ausgabe vorhanden), `prettier --check .`.

### P3 Infrastruktur

- Dockerfiles: node:24; Backend Multi-Stage mit Build-Kontext Repo-Root (`pnpm install --frozen-lockfile --filter bp-monolith-backend...`,
  `prisma generate`, `build`, `pnpm --filter bp-monolith-backend deploy --prod /out`), Runtime ohne Build-Toolchain, ohne `npm install tsx bcrypt reflect-metadata`,
  CMD `node dist/app/server.js`, non-root; Entrypoint: `prisma migrate deploy`, Seed nur über `SEED_ON_START=true`
  und nie in `production`; Frontend Multi-Stage mit Standalone-Output, `public/` und `.next/static`, `ARG NEXT_PUBLIC_API_URL` vor `next build`,
  `pnpm` über `npm i -g pnpm@11.26.0`, `ENV HUSKY=0`; `Dockerfile.dev` beider Seiten auf node:24.
- Compose (Root + `deployment/{local,dev,prod,prod-native}`): postgres:17-alpine, redis:8-alpine mit `--appendonly yes`,
  keine Default-Passwörter mehr (`${POSTGRES_PASSWORD:?}`-Syntax, fail closed), `env_file` oder `environment`, nicht beides
  für dieselbe Variable; Prisma-Studio-Service entfernen (7.10 bindet nur localhost; auf dem Host starten);
  Ports weiterhin nur 127.0.0.1; `no-new-privileges`, `cap_drop` bleiben.
- CI: `ci.yml` mit Jobs typecheck/lint/test (Backend gegen Postgres- und Redis-Service-Container, `prisma migrate deploy`),
  Frontend build, `scripts/security-check.sh`, gitleaks; `pr-preview.yml` auf die neuen Action-Versionen, Build-Kontext Root,
  `issues: write`/`pull-requests: write`, PR-Titel über `env:` statt Inline-Interpolation, Webhook mit Secret-Header.
- README, SECURITY.md, `example.env`, `backend/example.env` und `docs/` an den neuen Stand anpassen; Demo-Zugangsdaten
  aus dem README raus (Seed liest `SEED_ADMIN_PASSWORD`).

### P4 Verifikation und Review

- Frischer Clone in ein Temp-Verzeichnis: `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm build`.
- `docker compose up -d --build`, `/health` grün, Login-Smoke, `docker compose down -v`.
- `docker build -f backend/Dockerfile .` und `docker build -f frontend/Dockerfile .` vom Root.
- `pnpm audit --prod` ohne High/Critical.
- Security-Review des Diffs gegen die Liste unten.

## Sicherheitsliste (verbindlich)

1. Keine Secret-Fallbacks im Code: `modules/index.ts` (`'dev-secret'`, `'dev-refresh-secret'`), `auth/integration.ts`; Start schlägt fehl, wenn `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` fehlen (zod, min 32 Zeichen).
2. `auth/internal/utils/crypto.util.ts`: `scryptSync(secret, 'salt', 32)` mit Literal-Salt -> Salt aus `ENCRYPTION_KEY` per HKDF ableiten; `common/utils/crypto.util.ts`: PBKDF2 10.000 -> 600.000 Iterationen mit Format-Version im Ciphertext (`v2:`); `compareHash` mit `timingSafeEqual`.
3. Passwortgenerierung mit `crypto.randomInt`, kein `Math.random()`; nur eine Implementierung (die Kopie in `auth/internal/utils/password.util.ts` fällt weg oder ruft die gemeinsame).
4. bcrypt-Kosten aus genau einer Quelle (`BCRYPT_SALT_ROUNDS`, Default 12), auch für Backup-Codes und Seeds.
5. Token: eine Implementierung für Signieren/Prüfen, gleiche `issuer`/`audience`, kein `jwt.decode()`-Payload ohne `verify` (`secure-token.service.ts`), Access-Token 15 Minuten, Refresh 7 Tage, `algorithms: ['HS256']` überall.
6. TOTP: `validate` mit Fenster statt Code-Vergleich per String.
7. Uploads: Magic-Byte-Prüfung mit `file-type` zusätzlich zum Content-Type, `GET /api/upload/:fileId` nur authentifiziert, Dateinamen `randomUUID()`, Archiv- und Makroformate (`.zip`, `.doc`, `.xls`) aus der Allowlist, multer-`limits` für `files`, `fields`, `parts`, `fieldNameSize`; Auth-Fallback `requireAuth || noop` entfernen (Auth ist Pflicht).
8. `users` `/register` und `/otp`: eigener strenger Limiter; `authorize()` dort, wo das README es verspricht.
9. CORS: kein `NODE_ENV === 'development'`-Bypass; Allowlist aus `CORS_ORIGIN` (kommagetrennt) plus localhost-Ports für dev; Requests ohne Origin nur ohne Credentials.
10. Helmet 8 explizit: `hsts` (63072000, includeSubDomains, preload), `referrerPolicy`, CSP-Direktiven mit Quotes; `crossOriginResourcePolicy` passend zum Frontend-Origin.
11. Seeds: Admin-Passwort aus `SEED_ADMIN_PASSWORD` (Pflicht außerhalb von `test`), Seed verweigert in `production`; e2e-Fixtures lesen dieselben Variablen.
12. Logger: `excludeFields` enthält `authorization`, `cookie`, `password`, `token`, `refreshToken`, `secret`; morgan loggt keine Query-Strings mit Tokens.
13. `docker-entrypoint.sh`: kein `db push --accept-data-loss`, sondern `migrate deploy`.
14. Frontend-Tokens in `localStorage` bleiben vorerst (Architekturentscheidung, in SECURITY.md als bekannte Grenze dokumentiert; Alternative httpOnly-Cookies mit express-session + connect-redis).
15. Geheimnisse in der Git-Historie (Commit 326febbb): JWT_SECRET, JWT_REFRESH_SECRET, SESSION_SECRET, SMTP_PASS gelten als kompromittiert. Aufgabe für Ersin: nie wiederverwenden; optional `git filter-repo`.

## Bewusst nicht gemacht

- TypeScript 7 (keine JS-API; Wiedervorlage 7.1). ESLint 10 im Frontend (Wiedervorlage PR #91710).
- Wechsel zu Vitest (ts-jest reicht, kein zweiter Transformer). Wechsel zu lefthook (Husky reicht).
- Postgres 18 (Prisma-Support prüfen; 17 ist sicher). Node 26 (LTS erst 28.10.2026).
- httpOnly-Cookie-Auth im Frontend (Architekturänderung).
- Zusammenlegen der drei `BaseService`-Kopien und der doppelten `auth/internal/*`-Utilities über das Nötige hinaus (nur Token/Crypto/Passwort werden vereinheitlicht, weil sicherheitsrelevant).

## Prüfbefehle

```bash
pnpm install --frozen-lockfile
pnpm verify                 # typecheck + lint + test, alle Pakete
pnpm build
docker compose up -d --build && curl -s localhost:3011/health && docker compose down -v
docker build -f backend/Dockerfile . && docker build -f frontend/Dockerfile .
pnpm audit --prod
bash scripts/security-check.sh
```

## Nachträge

### P3 Infrastruktur (2026-09-09)

- Alle Compose-Dateien (Root, local, dev, prod, prod-native) bauen Backend und Frontend
  aus den Produktions-Dockerfiles mit Build-Kontext Repo-Root. `Dockerfile.dev` wird von
  keiner Compose-Datei mehr referenziert; Hot Reload läuft mit `docker compose up -d db redis`
  und `pnpm dev` je Paket auf dem Host. `deployment/local` und `deployment/dev` setzen weiterhin
  `NODE_ENV=development` (Seed erlaubt), `prod` und `prod-native` `production`.
- `NEXT_PUBLIC_API_URL` ist der Backend-Origin ohne `/api`-Suffix; die alten Werte
  `https://bp-dev.7style.net/api` hätten `/api/api/...` ergeben, weil die Frontend-Endpunkte
  `/api` selbst tragen. Der Wert ist Build-Arg des Frontend-Images.
- `restart: unless-stopped` in allen Varianten (prod vorher `always`). Redis in prod zusätzlich
  mit `--maxmemory 256mb`, Policy überall `noeviction` (Rate-Limit-Zähler).
- CI: Redis 8 startet per `docker run ... --requirepass` in einem Step, weil GitHub-Service-Container
  keine Kommando-Argumente erlauben und das `redis`-Image keine Passwort-Variable kennt.
  Postgres 17 ist ein Service-Container. Anwendungs-Secrets für CI werden pro Lauf mit
  `openssl rand` erzeugt, es liegt nichts Secret-Ähnliches im Workflow.
- `pr-preview.yml` ruft `ci.yml` als Reusable Workflow (`workflow_call`) auf; auf PRs läuft
  CI dadurch zweimal (Trigger `pull_request` plus Aufruf). Bewusst in Kauf genommen, damit
  der Preview-Job ein echtes `needs: ci` hat.
- Kompromisse, die andere Pakete betreffen (siehe open_issues des P3-Berichts): `.husky/pre-commit`
  blockt das Wort `docker.sock` auch in Kommentaren, darum heissen die Kommentare in den
  Compose-Dateien "Docker-Socket"; `backend/example.env` führt weiterhin `DATABASE_URL`,
  `REDIS_URL`, `PORT`, `NODE_ENV` (Compose überschreibt sie, Vorrang ist dokumentiert);
  `backend/Dockerfile` muss `/usr/src/app/uploads` anlegen und dem Laufzeit-User geben, damit
  das Volume `backend_uploads` beschreibbar ist; das Backend liest `HOST`
  (`env.config.ts`, Default `0.0.0.0`, neue Variable seit P3), `prod-native` setzt
  `HOST=127.0.0.1` und `HOSTNAME=127.0.0.1`, damit beide Container im Host-Netz nur
  loopback binden; UFW bleibt zweite Schranke.

## Nachträge P4 (Review)

Stand 2026-09-09, nach dem Review (Docs, Security, Verifier) auf `86753f97`. Dieser
Abschnitt deckt Backend, Workspace, Lockfile, SECURITY.md; Frontend, e2e, CI-Workflows,
Root-README und Upload-README wurden parallel in einem zweiten Schritt bearbeitet;
Kurzfassung unter "Zweiter Schritt" am Ende dieses Abschnitts.

### Befund

- Blocker: 2FA mit dem Passwort allein umgehbar (`/2fa/setup` mit dem temporären
  Login-Token, Backup-Codes schon beim Setup, `verifySetup`-Fallback beim Login);
  Kontoübernahme durch jeden Nutzer mit `users:users:read` (Reset-Token im Klartext
  in der Datenbank und in jeder Benutzerantwort), beides bereits vor dem Upgrade vorhanden.
- High: Entrypoint schrieb das Datenbank-Passwort ins Container-Log; winston verwarf jede
  Log-Zeile (Audit-Trail leer); frischer Clone ohne `prisma generate` rot; `backend/public`
  war eine Doku-Seite eines Kundenprojekts; `pnpm audit --prod` mit drei Highs über die
  Prisma-CLI; falscher `HOST`-Satz in den P3-Nachträgen.
- Medium/Low: siehe die Listen unten.

### Behoben (Backend, je eine Zeile)

- `/2fa/setup` und `/2fa/verify-setup` nur mit vollem Access-Token; Backup-Codes entstehen
  erst in `verifySetup` (alte gelöscht, Antwort `data.backupCodes`); kein `verifySetup`-Fallback
  in `completeTwoFactorLogin`; Jest: temporäres Token bekommt 401.
- Globales Prisma-`omit` (`app/lib/prisma-omit.ts`) für Passwort, Reset-/Verifizierungs-Token,
  TOTP-Secrets, Backup-Codes; `PrismaClient`-Typ aus dem Barrel ist omit-bewusst; Users-API
  mit fester Spaltenliste, ohne Sessions; `PUT /users/me` ohne `email`.
- Reset- und Verifizierungs-Token als SHA-256-Hash gespeichert, Lookup nur unabgelaufen,
  einmalig; Datenmigration `20260909160000_hash_reset_and_verification_tokens` leert alte
  Klartext-Token. Die Ablaufprüfung der Verifizierung las vorher eine nicht existierende Spalte.
- Logger: `excludeSensitiveData` schreibt auf das Original-Objekt zurück (winston-Symbole
  bleiben), Spy-Transport-Test; `authorize()` über winston ohne E-Mail/Permission-Dump.
- `backend/package.json` `postinstall: prisma generate`; Dockerfile und Dockerfile.dev kopieren
  `prisma/` und `prisma.config.ts` vor `pnpm install`; frischer Clone besteht `pnpm verify`.
  Jest setzt Testwerte für die Pflichtvariablen (`_tests_/jest.env.ts`).
- `docker-entrypoint.sh` maskiert `user:password@` per sed; sonst gibt kein Skript URLs aus.
- CORS: unbekannte Origin -> Antwort ohne CORS-Header (`callback(null, false)`), supertest-Test.
- `backend/public`, `/docs`-Mount, COPY-Zeilen und `files`-Eintrag entfernt (die erste Fassung
  von "Entfernt" liess die Seite stehen, inzwischen angepasst; sie war fremd und zeigte auf
  `/system/health`).
- `pnpm-workspace.yaml` `overrides`: `lodash 4.18.1`, `deepmerge-ts 8.0.2`, `prisma>mysql2: "-"`.
  `pnpm audit --prod`: 1 Low (`styled-jsx > @babel/core`, Frontend), kein High/Critical.
  Abweichung: `@prisma/config` pinnt `deepmerge-ts 7.1.5` exakt; 8.0.2 ist geprüft
  (`prisma validate`, `generate`, `migrate deploy` gegen Postgres 17, Image-Build), die
  8.0-Änderungen betreffen Map-Merging und Typnamen. `mysql2` lädt die CLI nur lazy für MySQL.
- Mediums: eigene Limiter für `/register` (5/h), `/check-email` und `/otp/request` (20/15 min),
  pro Request gezählt; `resendVerificationEmail` antwortet generisch; `SESSION_SECRET` optional
  (ungenutzt); Absender, Betreffe und HTML-Basis aus `APP_NAME` (Default `bp-monolith`,
  `APP_DESCRIPTION` leer) statt "Innovation Platform" / "7Style ...";
  `backend/example.env` mit EMAIL-/BREVO-Block, `TRUST_PROXY`, Platzhaltern statt Passwörtern,
  `LOG_LEVEL=info`; `services/email/README.md` deutsch.
- Lows: `TRUST_PROXY` (Default 1) statt fest `1`; CSV-Export neutralisiert Formel-Präfixe;
  2FA-Ciphertext mit Präfix `v1:`; `SecureTokenService` (zweite JWT-Implementierung, nie
  geroutet) gelöscht; Backup-Code-Anhäufung durch Löschen beim Re-Setup behoben;
  `backend/README.md` (Module inkl. `audit`, `CORS_ORIGIN`-Wortlaut, kein `public/`,
  `GENERATE_ON_START`); `seeds/README.md` (`db:reset` braucht `SEED_ADMIN_PASSWORD`).
- `BASE_URL` wird gelesen (`app.config.ts`, Upload-Links); der Docs-Befund dazu war falsch,
  der Satz in `backend/example.env` bleibt.

### Zurückgestellt (mit Grund)

- Refresh-Token-Rotation mit Wiederverwendungserkennung und Session-Prüfung im
  `authMiddleware`: Architekturänderung (Session-Metadaten, Frontend-Refresh-Verhalten),
  nicht lokal; 15-Minuten-Access-Token bleibt die Grenze.
- Login-Timing und zustandsabhängige Fehler vor der Passwortprüfung, `emailExists` in
  `/check-email`: der Frontend-Flow ("backend-driven auth") braucht `loginSecurityMode`;
  Limiter ergänzt, Dummy-bcrypt und generische Fehler als Folgeaufgabe.
- TOTP-Replay innerhalb des Fensters: braucht `lastCounter` in `TwoFactorAuth.metadata`
  plus Test am Login-Pfad; Folgeaufgabe.
- Backup-Codes mit SHA-256 statt bcrypt: Sicherheitsliste 4 schreibt bcrypt vor.
- `query parser extended` (`qs` mit `allowPrototypes`): eigener Parser bräuchte `qs` als
  direkte Abhängigkeit; kein ausnutzbarer Pfad, zod bleibt zweite Linie.
- Self-Registration mit sofort aktivem Konto und Upload ohne Besitzer: Produktentscheidung.
- Zwei `PasswordUtil`-Klassen: "Bewusst nicht gemacht" (Kosten kommen aus einer Quelle).
- `common/utils/crypto.util.ts` `encrypt`/`decrypt` ohne Aufrufer: bleibt (Sicherheitsliste 2).
- Prisma-Modelle `RevokedToken`/`TempToken` nach dem Löschen von `SecureTokenService`:
  Schemaänderung = Migration, später.
- `UPLOAD_MAX_FILE_SIZE`/`UPLOAD_ALLOWED_TYPES` nicht an multer verdrahtet: zusammen mit dem
  (parallel neu geschriebenen) Upload-README in einem Schritt, sonst Doku/Code-Drift.
- Nicht in diesem Schritt zugeordnete Dateien, offen für den Verifier: `cap_drop` für
  backend/frontend und feste `container_name` in den Compose-Dateien; Actions per SHA,
  `.gitleaks.toml`, `GITLEAKS_LICENSE` (`.github`); `docs/BACKEND-ARCHITECTURE.md` und
  `docs/rules/BACKEND-RULES.md` (`schemas/` vs. `dto/`, `services/ i18n`, `CORS_ORIGIN`,
  Pre-Commit-Satz); `hack/*.md`-Kopfzeile; `deployment/README.md` (`db` vs. `postgres`).
- `@babel/core` (Low, `next > styled-jsx`): Frontend-Baum, nicht Teil des Gates.
- Hinweis Frontend: `PUT /api/users/me` ignoriert `email`; ein Profilformular darf das
  Feld nicht mehr als änderbar anbieten.

### Zweiter Schritt (Frontend, e2e, CI)

- Login-Seite mit `data-testid`-Hooks (`login-*`, `password-toggle`, `dashboard-*`) und
  `noValidate` am Formular (react-hook-form zeigt die Feldfehler, kein Browser-Bubble);
  `NEXT_PUBLIC_APP_NAME` mit Default `bp-monolith` (`frontend/src/lib/app.ts`).
- e2e: Page Object `e2e/pages/login.page.ts`, Suite seriell mit einem Worker, ein Retry
  nur in CI; Fixtures lesen `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_USERS`,
  `SEED_DEMO_PASSWORD` (optional `TEST_*`), Specs mit Demo-Konten überspringen ohne sie.
- CI-Job `e2e`: Root-Compose-Stack mit pro Lauf erzeugten `.env`/`backend/.env`, dort
  `RATE_LIMIT_LOGIN_MAX=100`, weil ein Playwright-Retry die serielle Gruppe komplett
  wiederholt; Report und Traces als Artefakt bei Fehlern, `docker compose down -v` immer.

### Release-Check (2026-09-09)

- Die P4-Zeile "Absender, Betreffe und HTML-Basis aus `APP_NAME`" galt nur für
  `services/email/email.config.ts`. "Innovation Platform" stand weiterhin in
  `adapters/auth-email.adapter.ts` (OTP-Betreff), `adapters/user-email.adapter.ts`
  (Willkommens-Mails), `services/email/email.service.ts` (Fallback-Betreff),
  `templates/base.template.ts` (Logo), `templates/email-templates.ts` (Signaturen,
  Registrierungstext) und in beiden i18n-Locales (Betreffe, Copyright). Alle lesen jetzt
  `appConfig.name`; die Locales nutzen `{{appName}}`, das der `I18nService` immer setzt.
