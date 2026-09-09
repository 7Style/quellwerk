import { applyBase } from './base.html.js';

export function sendPasswordReset(p: { link: string; userName?: string }) {
  const html = `
    <p>Hallo${p.userName ? ' ' + escape(p.userName) : ''},</p>
    <p>du hast das Zurücksetzen deines Passworts angefordert.</p>
    <p style="margin:16px 0;"><a class="btn" href="${p.link}">Passwort zurücksetzen</a></p>
    <p class="muted">Falls der Button nicht funktioniert, öffne diesen Link:<br>
      <span style="word-break: break-all;">${p.link}</span></p>
    <p class="muted">Der Link ist 1 Stunde gültig. Nach dem Zurücksetzen werden aktive Sitzungen beendet.</p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

