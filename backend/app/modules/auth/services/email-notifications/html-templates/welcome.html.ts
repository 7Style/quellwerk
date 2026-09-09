import { applyBase } from './base.html.js';

export function sendWelcome(p: { loginUrl: string; userName?: string; temporaryPassword?: string }) {
  const html = `
    <p>Willkommen${p.userName ? ' ' + escape(p.userName) : ''}!</p>
    <p>Dein Konto wurde erfolgreich erstellt. Du kannst dich jetzt anmelden.</p>
    ${p.temporaryPassword ? `<p><strong>Temporäres Passwort:</strong> ${escape(p.temporaryPassword)}</p>` : ''}
    <p style="margin:16px 0;"><a class="btn" href="${p.loginUrl}">Zum Login</a></p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

