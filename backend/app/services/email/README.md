# E-Mail-Service (`app/services/email`)

Ein Provider-Interface, drei Implementierungen, Auswahl über `EMAIL_PROVIDER`
(Default: `console` außerhalb von `production`, sonst `brevo`). Alle Variablen
werden in `app/config/env.config.ts` validiert und in `email.config.ts` gebündelt;
Vorlage mit Defaults in `backend/example.env`.

| Provider | Zweck | Konfiguration |
|---|---|---|
| `console` | schreibt die Mail ins Log, kein Versand | keine |
| `smtp` | eigener Mailserver oder Relay (nodemailer 10) | `SMTP_HOST` (Pflicht, kein Default), `SMTP_PORT` (587), `SMTP_SECURE` (`false` = STARTTLS erzwungen über `requireTLS`, `true` = implizites TLS auf 465), `SMTP_USER`, `SMTP_PASS`; TLS unter 1.2 wird abgelehnt |
| `brevo` | Brevo-API mit Template-IDs | `BREVO_API_KEY` (Pflicht), `BREVO_API_URL`, `BREVO_SENDER_NAME`, `BREVO_SENDER_EMAIL`, `BREVO_TEMPLATE_*` |

Absender: `EMAIL_FROM_NAME` (Default `APP_NAME`) und `EMAIL_FROM_ADDRESS`
(Fallback `EMAIL_FROM`); Betreffzeilen tragen `APP_NAME`, überschreibbar über
`EMAIL_SUBJECT_*`. `SUPPORT_EMAIL` erscheint im Fußtext, `FRONTEND_URL` in Links.

## Struktur

```
email/
├── email.config.ts          Provider, SMTP/Brevo, Absender, Betreffe, Rate-Limits
├── email.service.ts         EmailService: Versand über den gewählten Provider
├── email.types.ts           Typen (Nachricht, Ergebnis, Optionen)
├── index.ts                 Export
├── providers/
│   ├── provider.interface.ts, provider.factory.ts
│   ├── smtp/                nodemailer-Transport (requireTLS, minVersion TLSv1.2)
│   ├── brevo/               HTTP-Client, Templates, Typen
│   └── console/             Log-Ausgabe
└── templates/               HTML-Basislayout und Template-Funktionen
```

## Verwendung

Die Module (`auth`, `users`) sprechen nicht direkt mit dem Service, sondern
über die Adapter in `app/adapters/*-email.adapter.ts`. Neuer Provider:
`providers/provider.interface.ts` implementieren und in
`providers/provider.factory.ts` registrieren.
