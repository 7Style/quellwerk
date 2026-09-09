import { applyBase } from './base.html.js';

export function sendTwoFactorEnabled(p: { userName?: string }) {
  const html = `
    <p>Hallo${p.userName ? ' ' + escape(p.userName) : ''},</p>
    <p>die Zwei‑Faktor‑Authentifizierung wurde für dein Konto aktiviert.</p>
    <p class="muted">Bei jedem Login wird ein 6‑stelliger Code aus deiner Authenticator‑App benötigt.</p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

