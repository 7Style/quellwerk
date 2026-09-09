import { applyBase } from './base.html.js';

export function sendEmailVerification(p: { link: string; userName?: string }) {
  const html = `
    <p>Hallo${p.userName ? ' ' + escape(p.userName) : ''},</p>
    <p>bitte bestätige deine E‑Mail‑Adresse über den folgenden Link:</p>
    <p style="margin:16px 0;"><a class="btn" href="${p.link}">E‑Mail verifizieren</a></p>
    <p class="muted">Falls der Button nicht funktioniert, öffne diesen Link:<br>
      <span style="word-break: break-all;">${p.link}</span></p>
    <p class="muted">Dieser Link ist 24 Stunden gültig.</p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

