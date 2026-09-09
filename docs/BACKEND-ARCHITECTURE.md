# Backend-Architektur

Stand nach dem Upgrade 2026-09 (siehe `UPGRADE-2026-09.md`). Node 24, ESM,
TypeScript 6 (NodeNext, ES2024), Express 5, Prisma 7, Jest 30.

## Einstieg und Struktur

```
backend/
├── app/
│   ├── server.ts            Bootstrap: listen(PORT, HOST), Graceful Shutdown, Prisma/Redis schliessen
│   ├── app.ts               createApp(): Helmet, CORS, Rate-Limits, Body-Parser, Logging, /health, Module
│   ├── config/
│   │   ├── env.config.ts    einzige Stelle, die process.env liest (zod 4, coerce, stringbool)
│   │   └── *.config.ts      beziehen Werte aus env.config.ts
│   ├── lib/
│   │   ├── prisma.ts        Barrel: PrismaPg-Adapter, Singleton, re-export des generierten Clients
│   │   └── redis.ts         node-redis-Client, connect() beim Start, close() beim Shutdown
│   ├── common/              Middleware (Error, Auth), Utilities (Logger, Crypto)
│   ├── modules/             Feature-Module, index.ts registriert sie
│   ├── adapters/            Adapter für modulübergreifende Dienste (E-Mail)
│   ├── services/            E-Mail, i18n
│   └── generated/prisma/    generierter Client (gitignored)
├── prisma/
│   ├── schema.prisma        Generator prisma-client, ESM, ohne url im datasource
│   ├── migrations/          eingecheckt; Entrypoint führt migrate deploy aus
│   ├── seed.ts, seeds/      Admin-Passwort aus SEED_ADMIN_PASSWORD, verweigert in production
│   └── ../prisma.config.ts  datasource.url aus DATABASE_URL, migrations.seed
├── Dockerfile               Multi-Stage vom Repo-Root, pnpm deploy --prod, non-root, node dist/app/server.js
└── docker-entrypoint.sh     prisma migrate deploy; Seed nur mit SEED_ON_START=true
```

`/health` prüft Postgres (`SELECT 1`) und Redis (`PING`) und antwortet mit
`database: connected`, `redis: connected`.

## Abhängigkeiten

| Bereich | Paket | Version |
|---|---|---|
| HTTP | express, cors, helmet, compression, morgan | 5.2, 2.8, 8.3, 1.8, 1.12 |
| Datenbank | prisma, @prisma/client, @prisma/adapter-pg | 7.10.0 (exakt) |
| Redis | redis (node-redis), rate-limit-redis, express-rate-limit | 6.2, 6.0, 8.7 |
| Auth | jsonwebtoken, bcrypt, otpauth, qrcode | 9.0, 6.0, 9.5, 1.5 |
| Validierung | zod | 4.5 |
| Sonstiges | dotenv, multer, nodemailer, winston, winston-daily-rotate-file, file-type | 17, 2.3, 10, 3.19, 5.0 |
| Werkzeuge | typescript, tsx, eslint + typescript-eslint, jest + ts-jest, supertest | 6.0.3, 4.23, 10 + 8.70, 30 + 29.4, 7.2 |

Entfernt (ohne Import oder ersetzt): class-validator, class-transformer,
reflect-metadata, uuid, crypto-js, dayjs, express-validator, ts-node,
express-session, connect-redis, speakeasy (durch otpauth), swagger-jsdoc,
swagger-ui-express, der Location-Finder-Dienst.

## Muster

### Module

Jedes Modul ist unabhängig: keine Importe aus `../../common` oder anderen
Modulen; Prisma, Logger und Events kommen per Dependency Injection beim
Initialisieren. Struktur:

```
modules/<domain>/
├── controllers/     nur HTTP (req/res), async (req, res) => {...}
├── services/        Fachlogik, eigener BaseService mit DI
├── routes/
├── dto/             zod-Schemas (*.schemas.ts), Typen per z.infer
├── interfaces/      IModuleConfig
├── internal/        Middleware, Repositories, Utilities des Moduls
├── events/
└── index.ts         createModule(config) / initModule(app, ...)
```

Es gibt keinen `asyncHandler` mehr: Express 5 fängt abgelehnte Promises
selbst und reicht sie an die Error-Middleware weiter (4-stellig, Rückgabetyp
`void`, `ZodError` -> 400, Prisma-Fehler P2002/P2003/P2025 gemappt).

### Konfiguration

`env.config.ts` validiert `process.env` mit zod (Pflicht: `DATABASE_URL`,
`REDIS_URL` sowie `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` mit je
32+ Zeichen; `SESSION_SECRET` ist optional und wird nicht gelesen, die Auth ist
JWT ohne Session-Store). Ohne gültige Werte startet der Prozess nicht; Fehler werden mit
`z.prettifyError` ausgegeben; ein leerer Wert (`KEY=`) gilt als nicht gesetzt.
Alle anderen Config-Dateien und Module lesen nur aus dieser Stelle. Compose
setzt `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`, `APP_NAME`, `UPLOAD_DIR`
und die `SEED_*`-Variablen (prod-native zusätzlich `HOST`); der Rest kommt aus
`backend/.env`.

### Datenbankzugriff

`lib/prisma.ts` erzeugt genau einen Client mit `PrismaPg`-Adapter
(`max 10`, `connectionTimeoutMillis 5000`, `idleTimeoutMillis 300000`) und
re-exportiert die generierten Typen; Module importieren nur von dort.
Immer `select`, immer paginierte `findMany`, Transaktionen für mehrstufige Schreibvorgänge.

### Rate-Limits

express-rate-limit 8 mit `limit`, `standardHeaders: 'draft-8'`,
`ipKeyGenerator` und Redis-Store; ein Prefix je Limiter (allgemein, Auth,
Registrierung, OTP, Passwort-Reset, 2FA, Upload). `/health` und `/` sind ausgenommen.

### Sicherheit

Siehe `../SECURITY.md`: Token-Laufzeiten 15 min / 7 d, HS256 mit festem
issuer/audience, HKDF-Salt, PBKDF2 600.000 (`v2:`), `timingSafeEqual`,
`crypto.randomInt`, Upload-Magic-Bytes, Logger-Maskierung.

## Datenmodell (Prisma)

| Modell | Zweck |
|---|---|
| User, Role, Permission, UserRole, RolePermission | Konten und RBAC |
| Session, RevokedToken, TempToken | Sitzungen, gesperrte JWTs, Einmal-Token |
| TwoFactorAuth, TwoFactorBackupCode, OneTimePasswordLogin | 2FA und OTP-Login |
| AuditLog, PermissionAuditLog, FieldPermission, Notification | Audit, Feldrechte, Benachrichtigungen |

## Befehle

```bash
pnpm --filter bp-monolith-backend run dev                   # tsx watch app/server.ts
pnpm --filter bp-monolith-backend run build                 # prisma generate && tsc -p .
pnpm --filter bp-monolith-backend run typecheck             # tsc --noEmit
pnpm --filter bp-monolith-backend run lint                  # eslint .
pnpm --filter bp-monolith-backend run test                  # jest --ci (ESM)
pnpm --filter bp-monolith-backend run prisma:generate
pnpm --filter bp-monolith-backend run prisma:migrate:dev    # Migration anlegen
pnpm --filter bp-monolith-backend run prisma:migrate:deploy
pnpm --filter bp-monolith-backend run prisma:seed           # SEED_ADMIN_PASSWORD nötig
pnpm --filter bp-monolith-backend exec prisma studio        # auf dem Host
```

## Umgebungsvariablen

```env
# Pflicht
DATABASE_URL=postgresql://...
REDIS_URL=redis://:...@host:6379
JWT_SECRET=            # openssl rand -hex 32
JWT_REFRESH_SECRET=    # openssl rand -hex 32
ENCRYPTION_KEY=        # openssl rand -hex 32

# Optional
CORS_ORIGIN=http://localhost:3010   # kommagetrennt; ohne Wert nur die localhost-Ports in development, in production praktisch Pflicht
SESSION_SECRET=                     # ungenutzt (Auth ist JWT, kein Session-Store); wenn gesetzt, 32+ Zeichen

# Optional mit Default
NODE_ENV=development
PORT=3011
HOST=0.0.0.0           # 127.0.0.1 in deployment/prod-native
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=300
RATE_LIMIT_LOGIN_MAX=5
LOG_LEVEL=info
UPLOAD_DIR=uploads
UPLOAD_MAX_FILE_SIZE=10485760
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,application/pdf
EMAIL_PROVIDER=console|smtp|brevo, EMAIL_FROM_NAME=, EMAIL_FROM_ADDRESS=, SMTP_HOST=, SMTP_PORT=587, SMTP_USER=, SMTP_PASS=
SEED_ADMIN_EMAIL=admin@bp-monolith.local, SEED_ADMIN_PASSWORD=   # nur für den Seed
SEED_DEMO_USERS=false, SEED_DEMO_PASSWORD=                       # Demo-Konten moderator@/user@/inactive@
```
