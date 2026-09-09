import { authEmailNotificationsConfig } from '../../../configs/email-notifications.config.js';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );

/** Layout with the application name (APP_NAME of the host app) as title and header */
const baseTemplate = (appName: string): string => `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${appName}</title>
  <style>
    body { background:#f3f4f6; margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; }
    .card { background:#fff; max-width:640px; margin:24px auto; border-radius:12px; border:1px solid #e5e7eb; overflow:hidden; }
    .header { background:#111827; color:#fff; padding:18px 24px; font-weight:700; font-size:18px; }
    .content { padding:24px; color:#111827; line-height:1.6; }
    .footer { padding:12px 24px; color:#6b7280; font-size:12px; border-top:1px solid #e5e7eb; }
    .btn { display:inline-block; background:#3b82f6; color:#fff !important; text-decoration:none; padding:10px 16px; border-radius:8px; font-weight:600; }
    .muted { color:#6b7280; font-size:12px; }
    a { color:#3b82f6; }
  </style>
  <!-- ###extraHead### -->
</head>
<body>
  <div class="card">
    <div class="header">${appName}</div>
    <div class="content">###content###</div>
    <div class="footer">Dies ist eine automatische Nachricht – bitte nicht antworten.</div>
  </div>
</body>
</html>`;

export function applyBase(contentHtml: string, extraHead: string = ""): string {
  return baseTemplate(escapeHtml(authEmailNotificationsConfig.appName))
    .replace('###content###', contentHtml)
    .replace('<!-- ###extraHead### -->', extraHead);
}

