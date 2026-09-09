import { applyBase } from './base.html.js';

export function sendTwoFactorDisabled(p: { userName?: string }) {
  const html = `
    <p>Hallo${p.userName ? ' ' + escape(p.userName) : ''},</p>
    <p>die Zwei‑Faktor‑Authentifizierung wurde für dein Konto deaktiviert.</p>
    <p class="muted">Wenn du das nicht warst, ändere bitte sofort dein Passwort.</p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

