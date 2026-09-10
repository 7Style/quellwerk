# Auth-Modul

Eigenständiges Modul für Authentifizierung: JWT (Access + Refresh), Sitzungen,
TOTP-2FA mit Backup-Codes, Einmalpasswort-Login (OTP per E-Mail),
E-Mail-Verifizierung, Passwort-Reset, Brute-Force-Schutz, Rollen und
Berechtigungen, Audit-Log, Events. Struktur in `STRUCTURE.md`.

Das Modul importiert nichts aus `../../common` oder anderen Modulen; Prisma,
Logger, E-Mail-Versand und Rate-Limit-Store kommen per Konfiguration beim
Erzeugen (`create-auth-module.ts`). Eingebettete Hilfsmittel liegen in
`internal/` (Token, Crypto, Passwort, Logger, Middleware, Exceptions).

## Einbindung

`integration.ts` erzeugt das Modul aus `env.config.ts` und wird in
`app/modules/index.ts` registriert; `index.ts` exportiert es als `authModule`.
Eigenständig:

```typescript
import { createAuthModule } from './create-auth-module.js';

const authModule = createAuthModule(
  {
    prismaClient: prisma,                 // oder databaseUrl
    jwtSecret: env.JWT_SECRET,            // min. 32 Zeichen, kein Fallback
    jwtExpiresIn: '15m',
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: '7d',
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
    twoFactorSecret: env.ENCRYPTION_KEY,  // verschlüsselt TOTP-Secrets
    bcryptRounds: env.BCRYPT_SALT_ROUNDS,
    rateLimitStore: (name) => redisStore(name),
    logger,                               // Pflicht
  },
  emailSender                             // optional: IAuthEmailSender
);

authModule.mount(app, '/api/auth');
authModule.on('USER_LOGIN', ({ userId, email }) => { /* ... */ });
```

Alle Felder: `interfaces/module.interface.ts` (`IAuthModuleConfig`).
Sicherheitsvorgaben (HS256, feste issuer/audience, 15 min / 7 d, HKDF-Salt,
`timingSafeEqual`, `crypto.randomInt`) stehen in `SECURITY.md` im Repo-Root.

## Endpunkte

Basis `/api/auth` (`routes/auth.routes.ts`), Berechtigungen unter
`routes/permission.routes.ts`.

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/login`, `/logout`, `/refresh`, `/register` | Anmeldung, Abmeldung, neues Token-Paar per Refresh-Token, Registrierung |
| POST | `/password/reset-request`, `/password/reset`, `/password/change` | Passwort-Reset und -Wechsel |
| POST | `/email/verify`, `/email/resend` | E-Mail-Verifizierung |
| POST | `/2fa/setup`, `/2fa/verify-setup` | TOTP einrichten und bestätigen; nur mit vollem Access-Token (Session, die 2FA bereits bestanden hat). Backup-Codes entstehen erst mit `/2fa/verify-setup` (Antwort `data.backupCodes`), alte Codes werden dabei gelöscht |
| POST | `/2fa/verify`, `/2fa/backup-codes` | Login mit TOTP oder Backup-Code (temporäres Token aus `/login` im Body), Backup-Codes neu erzeugen |
| GET | `/2fa/status` | 2FA-Status; einziger 2FA-Endpunkt, der auch das temporäre Token akzeptiert |
| DELETE | `/2fa/disable` | 2FA abschalten |
| POST | `/otp/*` | Einmalpasswort-Login (`services/one-time-password/`) |

Login, Registrierung, OTP, Passwort-Reset und 2FA haben eigene Rate-Limiter
(express-rate-limit 8, Redis-Store über `rateLimitStore`).

## Events

`events/auth.events.ts`: `USER_LOGIN`, `USER_LOGOUT`, `USER_REGISTERED`,
`LOGIN_FAILED`, `TWO_FACTOR_ENABLED`, `TWO_FACTOR_DISABLED`, `ACCOUNT_LOCKED`,
`SUSPICIOUS_ACTIVITY`. Abonnieren mit `authModule.on(event, handler)`.

## Abhängigkeiten

`jsonwebtoken`, `bcrypt`, `otpauth` (TOTP, RFC 6238), `qrcode`,
`express-rate-limit`, Prisma-Client über `app/lib/prisma.ts`. Validierung mit
zod-Schemas, keine Decorators.

## Tests

```bash
pnpm --filter @quellwerk/backend run test          # alle Tests
pnpm --filter @quellwerk/backend exec jest app/modules/auth
```

Tests liegen in `_tests_/` (Jest 30, `@jest/globals`), das Setup
`_tests_/jest.setup.ts` setzt die DI-Abhängigkeiten nach jedem Test zurück.
