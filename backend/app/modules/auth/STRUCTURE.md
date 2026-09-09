# Auth-Modul: Struktur

```
backend/app/modules/auth/
├── README.md                    Einbindung, Endpunkte, Events
├── STRUCTURE.md                 diese Datei
├── index.ts                     exportiert authModule (aus integration.ts)
├── integration.ts               erzeugt das Modul aus env.config.ts für diese App
├── create-auth-module.ts        Factory createAuthModule(config, emailSender?)
├── auth.module.ts               AuthModule: mount(app, prefix), on(event, handler)
├── controllers/
│   ├── auth.controller.ts       HTTP-Handler async (req, res)
│   └── permission.controller.ts
├── routes/
│   ├── auth.routes.ts           /api/auth/*, Rate-Limiter je Route
│   └── permission.routes.ts
├── services/
│   ├── base.service.ts          BaseService mit DI (Prisma, Logger, Events)
│   ├── auth.service.ts, auth-main-service.ts
│   ├── session.service.ts, token.service.ts
│   ├── user-db.service.ts, permission.service.ts, audit-log.service.ts
│   ├── 2fa.service.ts, otp.service.ts
│   ├── two-factor/              two-factor.service.ts, backup-codes.service.ts,
│   │                            providers/ (Factory, Interface, totp/totp.provider.ts mit otpauth)
│   ├── one-time-password/       one-time-password.service.ts
│   └── email-notifications/     email-service.ts, html-templates/*.html.ts
├── dto/                         auth.dto.ts, two-factor.dto.ts (Typen)
├── interfaces/                  module.interface.ts (IAuthModuleConfig, Adapter), email-sender.interface.ts
├── configs/                     email-notifications.config.ts
├── events/                      auth.events.ts
├── middleware/                  audit-log.middleware.ts
├── utils/                       audit-diff.util.ts
├── internal/                    eingebettete Hilfsmittel, keine Importe von außen
│   ├── enums/                   user-role.enum.ts
│   ├── exceptions/              base.exception.ts, auth.exception.ts
│   ├── middleware/              auth.middleware.ts, role-guard.middleware.ts, twofactor-auth.middleware.ts
│   └── utils/                   token.util.ts, crypto.util.ts, password.util.ts, email.util.ts, logger.util.ts
└── _tests_/                     Jest 30: jest.setup.ts, test-utils.ts, *.test.ts
```

## Grundsätze

1. **Keine Pfad-Abhängigkeiten nach außen**: nichts aus `../../common` oder
   anderen Modulen; alles Nötige liegt in `internal/` oder kommt per
   Konfiguration (Prisma-Client, Logger, E-Mail-Sender, Rate-Limit-Store).
   Einzige Ausnahme sind Typ-Importe des generierten Prisma-Clients über
   `app/lib/prisma.ts`.
2. **Datenbank**: Tabellen aus `prisma/schema.prisma` des Backends
   (User, Role, Permission, Session, RevokedToken, TempToken, TwoFactorAuth,
   TwoFactorBackupCode, OneTimePasswordLogin, AuditLog, PermissionAuditLog);
   Migrationen liegen in `backend/prisma/migrations/`.
3. **Konfiguration** nur über `IAuthModuleConfig` beim Erzeugen; das Modul
   liest kein `process.env` und hat keine Secret-Fallbacks.
4. **Kommunikation nach außen** ausschließlich über Interfaces (Adapter) und
   Events, keine direkten Service-Aufrufe anderer Module.
5. **Express 5**: Handler als `async (req, res)`, abgelehnte Promises landen
   in der zentralen Error-Middleware; kein `asyncHandler`.
