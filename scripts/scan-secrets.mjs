#!/usr/bin/env node
/**
 * Sucht in Dateien nach dem, was nicht öffentlich werden darf.
 *
 *   node scripts/scan-secrets.mjs docs/ai-process/sessions
 *
 * Die zweite Prüfung hinter `export-sessions.mjs`, und absichtlich eine eigene:
 * ein Schwärzer, der sich selbst prüft, prüft seine eigene Annahme. Diese Datei
 * kennt den Schwärzer nicht, sie liest nur das Ergebnis.
 *
 * Sie ist breiter angelegt und nimmt Fehlalarme in Kauf. Ein Treffer bedeutet
 * nicht "hier ist ein Secret", sondern "das sieht ein Mensch sich an, bevor es
 * öffentlich wird" - und bis dahin wird nicht committet. Exit 1 bei jedem
 * Treffer.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: node scripts/scan-secrets.mjs <pfad> [pfad...]');
  process.exit(2);
}

const RULES = [
  { name: 'Schlüssel mit sk-Präfix', re: /\bsk-(?!\[)[A-Za-z0-9_-]{16,}/ },
  { name: 'AWS-Zugriffsschlüssel', re: /\bAKIA(?!\[)[0-9A-Z]{16}\b/ },
  { name: 'GitHub-Token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'Privater Schlüssel', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Zugangsdaten in einer URL', re: /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]{1,64}:(?!\[)[^\s/@]{3,}@/i },
  { name: 'Bearer-Token', re: /\bBearer\s+(?!\[)[A-Za-z0-9._~+/-]{16,}/ },
  {
    name: 'Wert an einem Geheimniswort',
    re: /\b[A-Za-z_][A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?(?!\[geschwärzt\]|\$|\{|<|\[|process\.env|env\.|secrets\.|openssl|deine|your|xxx|\.\.\.|"?\s*$)[^\s"',;)}\]]{6,}/i,
  },
  {
    name: 'Cookie-Wert',
    re: /\b(?:sid|session|sess|auth)=(?!\[)[A-Za-z0-9%._-]{16,}/i,
  },
  {
    // Eine lange Zeichenkette, die aussieht, als hätte sie jemand gewürfelt.
    //
    // Die erste Fassung war "32 Zeichen aus dem Alphabet" und fand 1274 Stellen,
    // fast alle URLs und Importpfade. Eine Prüfung, die bei jedem Lauf
    // tausendmal anschlägt, liest niemand mehr - und dann übersieht man die
    // eine Zeile, auf die es ankam. Deshalb muss ein Treffer jetzt aussehen wie
    // ein Geheimnis und nicht wie Text: gemischte Gross- und Kleinschreibung
    // plus Ziffern, oder ein Base64-Block.
    name: 'Lange zufällige Zeichenkette',
    re: /\b[A-Za-z0-9+/_-]{28,}={0,2}\b/g,
    entropy: true,
  },
];

/**
 * Sieht die Zeichenkette gewürfelt aus?
 *
 * Zwei Fassungen davor haben sich selbst widerlegt. Die erste ("28 Zeichen aus
 * dem Alphabet") fand 1274 Stellen, fast alle URLs. Die zweite hielt jeden
 * langen URL-Pfad für einen Base64-Block, weil `/` in der Zeichenklasse steht.
 * Eine Prüfung, die tausendmal anschlägt, liest niemand mehr, und dann übersieht
 * man die eine Zeile, auf die es ankam.
 *
 * Also nach Form statt nach Länge, und die Reihenfolge ist Absicht: erst
 * ausschliessen, was hier ohnehin öffentlich steht, dann verlangen, dass der
 * Rest wie gewürfelt aussieht.
 */
/**
 * Sieht dieser Teil zwischen zwei Trennzeichen aus wie ein Wort?
 *
 * `Users`, `quellwerk`, `7style`, `2026` - ja. `T7hUV4OEVMMLUsC0PP5QEaHcA7` -
 * nein: zu lang und zu viele Ziffern mittendrin.
 */
function wordish(part) {
  if (part.length === 0) return true;
  if (/^[A-Za-z]+$/.test(part)) return true;
  if (/^\d{1,4}$/.test(part)) return true;
  // Ein Stück einer uuid oder ein kurzer Git-Hash. Beide stehen in diesem
  // Repository in jeder zweiten Zeile, und ein Geheimnis wird nicht mit
  // Bindestrichen in Zwölferblöcke geschnitten.
  if (/^[0-9a-f]{4,12}$/i.test(part)) return true;

  // Kurz genug, um ein Wort zu sein, und nicht ueberwiegend Ziffern. Der
  // Anteil und nicht die Anzahl: `bqs26bk4a` ist ein Dateiname aus dem
  // Arbeitsverzeichnis, kein Geheimnis, und drei Ziffern in neun Zeichen sind
  // in einem Pfad normal.
  const digitRatio = (part.match(/\d/g) ?? []).length / part.length;
  return part.length <= 12 && digitRatio < 0.5 && /^[A-Za-z0-9]+$/.test(part);
}

function isStructuredText(text) {
  const parts = text.split(/[-_/.:@]/);
  return parts.length > 1 && parts.every(wordish);
}

function looksRandom(text) {
  // Ein Hash, den git oder sha256 schreibt, und eine uuid.
  if (/^[0-9a-f]{7}$|^[0-9a-f]{8}$|^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(text)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return false;

  const mixedCase = /[a-z]/.test(text) && /[A-Z]/.test(text);
  const digits = /[0-9]/.test(text);

  // Zusammengesetzter Text: ein Pfad, ein Paketname, ein Wort mit Bindestrichen.
  // Entschieden wird das an den Teilen zwischen den Trennzeichen - sehen alle
  // aus wie Wörter, ist das Ganze Text. Ein Token hat lange Teile, in denen
  // Buchstaben und Ziffern durcheinanderstehen.
  if (isStructuredText(text)) return false;

  // Ein Wort, auch ein langes, und ein Slug aus Kleinbuchstaben.
  if (/^[A-Za-z]+$/.test(text)) return false;
  if (/^[a-z][a-z-]*$/.test(text)) return false;

  // Alles andere: mindestens zwei Zeichenklassen, dann sieht ein Mensch es an.
  // Zwei und nicht drei, weil `openssl rand -hex` nur Kleinbuchstaben und
  // Ziffern liefert - und genau so entstehen die Passwörter dieses Projekts.
  const classes = Number(/[a-z]/.test(text)) + Number(/[A-Z]/.test(text)) + Number(digits);
  return classes >= 2;
}

async function* files(root) {
  const info = await stat(root);
  if (info.isFile()) {
    yield root;
    return;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

let findings = 0;
let scanned = 0;

for (const root of roots) {
  for await (const file of files(root)) {
    const text = await readFile(file, 'utf8');
    scanned += 1;
    const lines = text.split('\n');

    lines.forEach((line, index) => {
      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        const hit = rule.re.exec(line);
        if (!hit) continue;
        if (rule.entropy && !looksRandom(hit[0])) continue;
        findings += 1;
        const where = `${path.relative(process.cwd(), file)}:${index + 1}`;
        const shown = line.trim().slice(0, 160);
        console.log(`FUND  ${rule.name}\n      ${where}\n      ${shown}\n`);
      }
    });
  }
}

console.log(`${scanned} Dateien geprüft, ${findings} Fundstellen.`);
process.exit(findings > 0 ? 1 : 0);
