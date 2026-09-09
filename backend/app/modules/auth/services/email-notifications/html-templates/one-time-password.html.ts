import { applyBase } from './base.html.js';

interface TemplateParams {
  code: string;
  userName?: string;
  deepLinkUrl?: string;
}

export function sendOneTimePassword(params: TemplateParams) {
  const namePart = params.userName ? ` ${escapeHtml(params.userName)}` : '';
  const deepLink = params.deepLinkUrl
    ? `<p>Oder nutze folgenden Link für den direkten Login:</p>
       <p><a class="btn" href="${escapeHtml(params.deepLinkUrl)}">Jetzt einloggen</a></p>`
    : '';

  const html = `
    <p>Hallo${namePart},</p>
    <p>hier ist dein Einmalpasswort:</p>
    <div style="font-family:monospace;font-size:22px;font-weight:700;background:#111827;color:#ffffff;display:inline-block;padding:10px 16px;border-radius:8px;letter-spacing:4px;">${escapeHtml(params.code)}</div>
    <p class="muted">Der Code ist für kurze Zeit gültig. Bitte nutze ihn sofort.</p>
    ${deepLink}
  `;

  return applyBase(html);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}
