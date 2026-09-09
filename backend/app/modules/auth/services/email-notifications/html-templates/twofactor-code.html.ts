import { applyBase } from './base.html.js';

export function sendTwoFactorCode(p: { code: string; userName?: string }) {
  const html = `
    <p>Hallo${p.userName ? ' ' + escape(p.userName) : ''},</p>
    <p>dein Zwei‑Faktor‑Code lautet:</p>
    <div style="font-family:monospace;font-size:22px;font-weight:700;background:#111827;color:#ffffff;display:inline-block;padding:8px 12px;border-radius:8px;letter-spacing:3px;">${escape(p.code)}</div>
    <p class="muted">Der Code ist 5 Minuten lang gültig.</p>
  `;
  return applyBase(html);
}

function escape(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); }

