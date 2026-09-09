import { applyBase } from './base.html.js';

export function sendAccountLocked(p: { untilText?: string; userName?: string }) {
  const html = `
    <p>Hallo${p.userName ? ' ' + escape(p.userName) : ''},</p>
    <p>dein Konto wurde vorübergehend gesperrt, da es zu viele fehlgeschlagene Anmeldeversuche gab.</p>
    ${p.untilText ? `<p>Die Sperre endet: <strong>${escape(p.untilText)}</strong></p>` : ''}
    <p class="muted">Du kannst später erneut versuchen dich anzumelden oder dein Passwort zurücksetzen.</p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

