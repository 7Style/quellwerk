# Backend (`bp-monolith-backend`)

Node 24, ESM, TypeScript 6, Express 5, Prisma 7 auf PostgreSQL 17, Redis 8
als Store für die Rate-Limits, Jest 30. Paket des pnpm-Workspace im Repo-Root;
Architektur in `docs/BACKEND-ARCHITECTURE.md`, Regeln in `docs/rules/BACKEND-RULES.md`.

## Befehle

Aufruf über `pnpm --filter bp-monolith-backend run <skript>` (oder `exec` für
Binaries wie `prisma`, `tsc`, `eslint`).

| Skript | Was |
|---|---|
| `dev` | `tsx watch app/server.ts` |
| `build` | `prisma generate && tsc -p .` nach `dist/` |
| `start` | `node dist/app/server.js` |
| `typecheck` | `tsc --noEmit` |
| `lint`, `lint:fix` | ESLint 10 (Flat Config, typed rules) |
| `test`, `test:watch`, `test:coverage` | Jest 30 im ESM-Modus (`--ci` im `test`-Skript, nie Watch) |
| `postinstall` | `prisma generate`, läuft bei jedem `pnpm install` (frischer Clone braucht keinen manuellen Schritt; ohne `DATABASE_URL` möglich) |
| `prisma:generate` | Client nach `app/generated/prisma` (gitignored) |
| `prisma:validate` | Schema prüfen |
| `prisma:migrate:dev` | Migration anlegen (Entwicklung) |
| `prisma:migrate:deploy` | Migrationen einspielen (Container-Entrypoint, CI, Produktion) |
| `prisma:seed` | `prisma db seed` (Rollen, Berechtigungen, Admin; siehe unten) |
| `prisma:studio` | Prisma Studio, nur auf dem Host |
| `db:reset` | `prisma migrate reset --force` (löscht alle Daten) |
| `db:setup` | migrate dev, generate, seed |

## Umgebung

`backend/.env` (Vorlage `backend/example.env`), einmal geladen und mit zod in
`app/config/env.config.ts` validiert; kein anderes Modul liest `process.env`.
Ein leerer Wert (`KEY=`) gilt als nicht gesetzt.

- Pflicht: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
  `ENCRYPTION_KEY` (Secrets mindestens 32 Zeichen, `openssl rand -hex 32`).
  Ohne sie startet der Server nicht. `SESSION_SECRET` ist optional und wird
  nicht gelesen (express-session entfernt); wenn gesetzt, ebenfalls 32+ Zeichen.
- Optional mit Default: `PORT` (3011), `HOST` (0.0.0.0; `127.0.0.1` in
  `deployment/prod-native`), `TRUST_PROXY` (1 = hinter Nginx, 0 = direkt
  erreichbar), `NODE_ENV`, `APP_NAME` (bp-monolith), `RATE_LIMIT_*`,
  `LOG_LEVEL`, `UPLOAD_*`, `EMAIL_*`/`SMTP_*`/`BREVO_*`, `SEED_*`.
- `CORS_ORIGIN` (kommagetrennt) ist optional ohne Default: ohne Wert sind nur
  die localhost-Ports in `development` erlaubt, in `production` also praktisch
  Pflicht. Unbekannte Origins bekommen die Antwort ohne CORS-Header (kein 500).
- Docker Compose setzt `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`,
  `APP_NAME`, `UPLOAD_DIR` und alle `SEED_*` im Block `environment`; diese
  Werte gewinnen gegen `backend/.env` (Kopfzeile von `example.env`).

## Prisma-Workflow

```bash
pnpm --filter bp-monolith-backend run prisma:migrate:dev --name <name>   # Schema geändert -> Migration + Client
pnpm --filter bp-monolith-backend run prisma:generate                    # nur Client (auch im Pre-Commit-Hook)
pnpm --filter bp-monolith-backend run prisma:migrate:deploy              # eingecheckte Migrationen einspielen
SEED_ADMIN_PASSWORD='...' pnpm --filter bp-monolith-backend run prisma:seed
```

- `prisma/schema.prisma`: Generator `prisma-client` (ESM, `app/generated/prisma`),
  `datasource` ohne `url`; die URL kommt aus `prisma.config.ts` (`DATABASE_URL`).
- `prisma/migrations/` ist eingecheckt; der Container-Entrypoint führt bei jedem
  Start `prisma migrate deploy` aus (nie `db push`).
- Seed (`prisma/seed.ts`, `prisma/seeds/`): Rollen, Berechtigungen, Zuordnungen
  und der SUPER_ADMIN (`SEED_ADMIN_EMAIL`, Passwort aus `SEED_ADMIN_PASSWORD`,
  Pflicht). Demo-Konten `moderator@`, `user@`, `inactive@` mit der Domain des
  Admins nur mit `SEED_DEMO_USERS=true` und `SEED_DEMO_PASSWORD`. Verweigert
  mit `NODE_ENV=production`. Im Container nur mit `SEED_ON_START=true`
  (Root-`.env`), dort läuft der kompilierte Seed `dist/prisma/seed.js`.
- Importe des Clients ausschließlich über `app/lib/prisma.ts` (PrismaPg-Adapter, Singleton).

## Tests

```bash
pnpm --filter bp-monolith-backend run test
```

Jest 30 mit ts-jest (ESM-Preset, `tsconfig.test.json`), Tests unter
`**/_tests_/*.test.ts` mit `import { jest, describe, it, expect } from '@jest/globals'`,
Setup in `app/modules/auth/_tests_/jest.setup.ts`. `env.config.ts` wird beim
Import validiert; `jest.env.ts` (`setupFiles`) setzt für die Pflichtvariablen
Testwerte, sofern sie fehlen, darum laufen die Tests auch auf einem frischen
Clone ohne `.env` (gesetzte Werte, etwa die Wegwerf-Secrets in CI, gewinnen).
Kein Test öffnet eine Datenbank- oder Redis-Verbindung; CI stellt Postgres 17
und Redis 8 trotzdem als Service-Container bereit und spielt vorher die
Migrationen ein.

## Docker

```bash
docker build -f backend/Dockerfile -t bp-backend .     # Build-Kontext Repo-Root, .dockerignore dort
```

Multi-Stage (`pnpm deploy --prod`), Laufzeit ohne Build-Toolchain als
`nodejs` (uid 1001) in `/usr/src/app`: `dist/`, `prisma/`, `prisma.config.ts`,
`logs/`, `uploads/` (= `UPLOAD_DIR`, Volume `backend_uploads`). `prisma/` und
`prisma.config.ts` werden vor `pnpm install` kopiert, weil `postinstall`
den Client erzeugt. Entrypoint `docker-entrypoint.sh`: `prisma migrate deploy`,
optional Seed, dann `node dist/app/server.js`; Verbindungs-URLs erscheinen im
Log nur maskiert (`user:***@host`). `/health` prüft Postgres und Redis.
`Dockerfile.dev` (tsx watch, `app/` gemountet) erzeugt den Client beim Start
zusätzlich mit `GENERATE_ON_START=1`.

## Struktur

```
backend/
├── app/
│   ├── server.ts            listen(PORT, HOST), Graceful Shutdown
│   ├── app.ts               createApp(): Helmet, CORS, Rate-Limits, Logging, /health, Module
│   ├── config/              env.config.ts (zod) und abgeleitete *.config.ts
│   ├── lib/                 prisma.ts (Client-Barrel), prisma-omit.ts (global ausgeblendete Spalten), redis.ts
│   ├── common/              Middleware, Exceptions, Utilities
│   ├── modules/             auth, users, audit, audit-logs, upload (jedes Modul mit eigenem BaseService)
│   ├── services/            E-Mail, i18n
│   └── generated/prisma/    generierter Client (gitignored)
├── prisma/                  schema.prisma, migrations/, seed.ts, seeds/
├── prisma.config.ts         Prisma-7-CLI-Konfiguration
├── Dockerfile, docker-entrypoint.sh
└── example.env              Vorlage für backend/.env
```
