#!/usr/bin/env node
/**
 * Macht aus den Claude-Code-Transkripten lesbares Markdown unter
 * docs/ai-process/sessions/.
 *
 *   node scripts/export-sessions.mjs            # schreibt
 *   node scripts/export-sessions.mjs --dry-run  # sagt nur, was entstünde
 *
 * Was hineinkommt, und warum nur das:
 *
 * - **Meine Prompts, wörtlich.** Sie sind der Teil, an dem man sieht, wie
 *   gesteuert wurde. Entfernt wird nur, was die Oberfläche selbst angehängt hat
 *   (`<ide_opened_file>`, `<system-reminder>`): das habe ich nicht getippt.
 * - **Die Antworten des Agenten als Text.** Ohne Thinking - das ist kein
 *   Ergebnis, sondern ein Zwischenstand, und es als Beleg zu lesen wäre ein
 *   Missverständnis.
 * - **Werkzeugaufrufe als eine Zeile.** Welches Werkzeug, worauf. Ohne Ausgabe:
 *   die Ausgaben sind der grösste Teil eines Transkripts, sie enthalten
 *   Dateiinhalte, Datenbankzeilen und Testläufe, und was daran eine
 *   Entscheidung war, steht in der Antwort daneben.
 *
 * Die acht Subagent-Läufe bekommen je eine Datei, mit Auftrag und Ergebnis.
 * Dazwischen liegt ihre eigene Werkzeugarbeit; sie ist aus demselben Grund
 * nicht dabei.
 *
 * **Geschwärzt wird vor dem Schreiben**, nicht danach: was nach Schlüssel,
 * Passwort, Token oder Verbindungs-URL mit Passwort aussieht, wird ersetzt und
 * gezählt. Das Skript gibt am Ende aus, wie oft jedes Muster gegriffen hat. Die
 * zweite Prüfung (`scripts/scan-secrets.mjs`) liest die geschriebenen Dateien
 * noch einmal mit eigenen Mustern; erst wenn die schweigt, wird committet.
 */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';

const PROJECT = '-Users-7style-Projects-quellwerk';
const SESSION = 'eba5f28a-345f-49f5-b7a0-d53b4f5c9c48';
const ROOT = path.join(os.homedir(), '.claude', 'projects', PROJECT);
const OUT = path.join(process.cwd(), 'docs', 'ai-process', 'sessions');

const dryRun = process.argv.includes('--dry-run');

/* -------------------------------------------------------------------------- */
/* Schwärzen                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Die Muster, in der Reihenfolge, in der sie greifen sollen.
 *
 * Zuerst das Besondere (bekannte Schlüsselformen, Zugangsdaten in einer URL),
 * dann das Allgemeine (Zuweisung an ein Wort wie "token"). Jede Ersetzung
 * behält das Etikett und nimmt nur den Wert: `PASSWORD=[geschwärzt]` sagt einem
 * Leser mehr als eine Zeile, die verschwunden ist.
 */
const REDACTIONS = [
  {
    name: 'Anthropic-Schlüssel',
    re: /\bsk-ant-[A-Za-z0-9_-]{10,}/g,
    to: 'sk-ant-[geschwärzt]',
  },
  { name: 'Schlüssel mit sk-Präfix', re: /\bsk-[A-Za-z0-9_-]{20,}/g, to: 'sk-[geschwärzt]' },
  { name: 'AWS-Zugriffsschlüssel', re: /\bAKIA[0-9A-Z]{16}\b/g, to: 'AKIA[geschwärzt]' },
  {
    name: 'Zugangsdaten in einer URL',
    re: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]{1,64}):([^\s/@]{1,256})@/gi,
    to: (_m, scheme, user) => `${scheme}${user}:[geschwärzt]@`,
  },
  {
    name: 'Bearer-Token',
    re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
    to: 'Bearer [geschwärzt]',
  },
  {
    name: 'Sitzungs-Cookie',
    re: /\b(qw\.sid=)[^\s"'&;]+/g,
    to: (_m, label) => `${label}[geschwärzt]`,
  },
  {
    name: 'Zuweisung an ein Geheimniswort',
    // KEY=..., "token": "...", PASSWORD: ... - das Etikett bleibt, der Wert geht.
    re: /\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD)[A-Za-z0-9_]*)(["']?\s*[:=]\s*["']?)([^\s"',;)}\]]{6,})/gi,
    to: (_m, label, sep, value) => (isPlaceholder(value) ? _m : `${label}${sep}[geschwärzt]`),
  },
  {
    name: 'Privater Schlüssel',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    to: '[geschwärzt: privater Schlüssel]',
  },
];

/**
 * Was wie ein Wert aussieht, aber keiner ist.
 *
 * `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?...}` aus einer Compose-Datei, ein
 * `$SECRET` in einer Shell-Zeile, ein `<dein-key>` in einer Anleitung: das sind
 * die Stellen, an denen in diesem Repository über Secrets geredet wird, und sie
 * zu schwärzen würde die Dokumentation unlesbar machen, ohne etwas zu schützen.
 */
function isPlaceholder(value) {
  return (
    value.startsWith('$') ||
    value.startsWith('${') ||
    value.startsWith('<') ||
    value.startsWith('[') ||
    /^(openssl|process\.env|env\.|secrets\.|deine?|your|xxx+|\.\.\.)/i.test(value) ||
    /^["'`]?\$\{?/.test(value)
  );
}

const redactionHits = new Map();

function redact(text) {
  let out = text;
  for (const rule of REDACTIONS) {
    out = out.replace(rule.re, (...args) => {
      redactionHits.set(rule.name, (redactionHits.get(rule.name) ?? 0) + 1);
      return typeof rule.to === 'function' ? rule.to(...args) : rule.to;
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Lesen                                                                       */
/* -------------------------------------------------------------------------- */

/** Was die Oberfläche an einen Prompt hängt und ich nicht getippt habe. */
function stripInjections(text) {
  return text
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
    .trim();
}

/** Eine Nachricht, die nicht von mir kam, auch wenn sie als Prompt ankommt. */
function isInjected(text) {
  return (
    text.startsWith('[SYSTEM NOTIFICATION') ||
    text.startsWith('Base directory for this skill:') ||
    text.startsWith('[Request interrupted') ||
    text.includes('<task-notification>') ||
    text.startsWith('This session is being continued from a previous conversation')
  );
}

/** Ein Werkzeugaufruf in einer Zeile: was es war, worauf. */
function toolLine(block) {
  const input = block.input ?? {};
  const target =
    input.file_path ??
    input.path ??
    input.command ??
    input.pattern ??
    input.url ??
    input.prompt ??
    input.description ??
    '';
  const one = String(target).replace(/\s+/g, ' ').trim();
  const short = one.length > 140 ? `${one.slice(0, 137)}...` : one;
  return short ? `\`${block.name}\` — ${short}` : `\`${block.name}\``;
}

async function* records(file) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // Eine unlesbare Zeile ist kein Grund, den Export abzubrechen; sie wäre
      // ohnehin nichts, was jemand lesen wollte.
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Schreiben                                                                   */
/* -------------------------------------------------------------------------- */

function quote(text) {
  return text
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

function timeOf(ts) {
  return ts ? ts.slice(11, 16) : '';
}

async function exportMain() {
  const file = path.join(ROOT, `${SESSION}.jsonl`);
  const days = new Map();
  const counts = { prompts: 0, answers: 0, tools: 0 };

  for await (const o of records(file)) {
    const ts = o.timestamp ?? '';
    const day = ts.slice(0, 10);
    if (!day) continue;

    if (o.type === 'user' && o.promptSource === 'sdk') {
      const content = o.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      if (!text || isInjected(text)) continue;
      const clean = stripInjections(text);
      if (!clean) continue;
      push(days, day, { kind: 'prompt', ts, text: clean });
      counts.prompts += 1;
      continue;
    }

    if (o.type === 'assistant') {
      for (const block of o.message?.content ?? []) {
        if (block.type === 'text' && block.text.trim()) {
          push(days, day, { kind: 'answer', ts, text: block.text });
          counts.answers += 1;
        } else if (block.type === 'tool_use') {
          push(days, day, { kind: 'tool', ts, text: toolLine(block) });
          counts.tools += 1;
        }
        // thinking: absichtlich nicht.
      }
    }
  }

  const written = [];
  for (const [day, entries] of [...days.entries()].sort()) {
    const lines = [
      `# ${day}`,
      '',
      `Aus der Hauptsession. Prompts wörtlich, Antworten als Text, Werkzeugaufrufe`,
      `als eine Zeile, keine Werkzeugausgaben, kein Thinking. Wie der Export`,
      `entsteht, steht in [README.md](README.md).`,
      '',
    ];

    let lastTool = false;
    for (const entry of entries) {
      if (entry.kind === 'prompt') {
        lines.push(`## ${timeOf(entry.ts)} — Ersin`, '', quote(entry.text), '');
        lastTool = false;
      } else if (entry.kind === 'answer') {
        lines.push(entry.text.trim(), '');
        lastTool = false;
      } else {
        if (!lastTool) lines.push('');
        lines.push(`- ${entry.text}`);
        lastTool = true;
      }
    }

    const body = redact(lines.join('\n').replace(/\n{4,}/g, '\n\n\n')) + '\n';
    written.push({ file: path.join(OUT, `${day}.md`), body });
  }

  return { written, counts };
}

function push(map, day, entry) {
  if (!map.has(day)) map.set(day, []);
  map.get(day).push(entry);
}

async function exportSubagents() {
  const dir = path.join(ROOT, SESSION, 'subagents');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.jsonl')).sort();
  const written = [];

  for (const name of files) {
    const id = name.replace(/\.jsonl$/, '');
    let meta = {};
    try {
      meta = JSON.parse(await readFile(path.join(dir, `${id}.meta.json`), 'utf8'));
    } catch {
      // Ohne Meta-Datei bleibt der Lauf trotzdem lesbar.
    }

    let task = null;
    let result = null;
    let tools = 0;
    for await (const o of records(path.join(dir, name))) {
      if (o.type === 'user' && task === null) {
        const content = o.message?.content;
        if (typeof content === 'string') task = content;
        else if (Array.isArray(content)) {
          const text = content.find((b) => b.type === 'text')?.text;
          if (text) task = text;
        }
      }
      if (o.type === 'assistant') {
        for (const block of o.message?.content ?? []) {
          if (block.type === 'text' && block.text.trim()) result = block.text;
          if (block.type === 'tool_use') tools += 1;
        }
      }
    }

    const slug = (meta.description ?? id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);

    const lines = [
      `# ${meta.description ?? id}`,
      '',
      `Subagent-Lauf \`${meta.agentType ?? 'unbekannt'}\`, ${tools} Werkzeugaufrufe.`,
      `Auftrag und Ergebnis, nichts dazwischen: was der Lauf gelesen hat, ist`,
      `Werkzeugausgabe (siehe [README.md](../README.md)).`,
      '',
      '## Auftrag',
      '',
      quote(task ?? '(nicht im Transkript)'),
      '',
      '## Ergebnis',
      '',
      (result ?? '(kein Ergebnis im Transkript)').trim(),
      '',
    ];

    written.push({
      file: path.join(OUT, 'subagents', `${slug || id}.md`),
      body: redact(lines.join('\n')) + '\n',
    });
  }

  return written;
}

function readme(days, subagents, counts) {
  return redact(
    [
      '# Sessions',
      '',
      'Die Arbeit an diesem Repository, als Markdown. Erzeugt von',
      '`scripts/export-sessions.mjs` aus den Transkripten von Claude Code; die',
      'Rohdateien selbst sind nicht eingecheckt (siehe ../TRANSCRIPTS.md).',
      '',
      `${days} Tage aus der bauenden Session, ${counts.prompts} Prompts,`,
      `${counts.answers} Antworten, ${counts.tools} Werkzeugaufrufe als Zeile.`,
      `Dazu ${subagents} Subagent-Läufe unter [subagents/](subagents/).`,
      '',
      '## Was drin ist, und was nicht',
      '',
      '- **Meine Prompts, wörtlich.** Entfernt ist nur, was die Oberfläche',
      '  angehängt hat: `<ide_opened_file>`, `<system-reminder>`. Das habe ich',
      '  nicht getippt.',
      '- **Die Antworten als Text.** Kein Thinking: das ist ein Zwischenstand und',
      '  kein Ergebnis, und als Beleg gelesen wäre es ein Missverständnis.',
      '- **Werkzeugaufrufe als eine Zeile:** welches Werkzeug, worauf.',
      '- **Keine Werkzeugausgaben.** Sie sind der grösste Teil eines Transkripts -',
      '  Dateiinhalte, Datenbankzeilen, Testläufe - und was daran eine Entscheidung',
      '  war, steht in der Antwort daneben. Was der Code tut, steht im Code; was',
      '  gemessen wurde, in RESULTS.md und in den Commit-Nachrichten.',
      '',
      '## Geschwärzt',
      '',
      'Vor dem Schreiben, nicht danach: Schlüssel, Token, Passwörter und',
      'Verbindungs-URLs mit Zugangsdaten werden ersetzt, das Etikett bleibt',
      'stehen. Danach liest `scripts/scan-secrets.mjs` die geschriebenen Dateien',
      'noch einmal mit eigenen Mustern. Der Export wird erst committet, wenn diese',
      'zweite Suche nichts findet.',
      '',
      'Das ist eine Maschine, kein Versprechen. Wer hier etwas findet, das nicht',
      'öffentlich sein sollte: bitte melden.',
      '',
      '## Zwei Sessions',
      '',
      'Hier liegt die bauende Session. Die zweite, mit der geplant und deployt',
      'wurde, ist nicht dabei; was sie gemacht hat, steht in',
      '[../AI-DECLARATION.md](../AI-DECLARATION.md).',
      '',
    ].join('\n')
  );
}

async function main() {
  const { written: dayFiles, counts } = await exportMain();
  const subFiles = await exportSubagents();

  const all = [
    ...dayFiles,
    ...subFiles,
    {
      file: path.join(OUT, 'README.md'),
      body: readme(dayFiles.length, subFiles.length, counts) + '\n',
    },
  ];

  const total = all.reduce((sum, one) => sum + Buffer.byteLength(one.body), 0);
  console.log(`${all.length} Dateien, ${(total / 1024).toFixed(0)} KB`);
  console.log(
    `  ${counts.prompts} Prompts, ${counts.answers} Antworten, ${counts.tools} Werkzeugzeilen`
  );

  if (redactionHits.size === 0) {
    console.log('  geschwärzt: nichts gefunden');
  } else {
    for (const [name, count] of redactionHits) console.log(`  geschwärzt: ${name} x${count}`);
  }

  if (dryRun) {
    console.log('--dry-run: nichts geschrieben.');
    return;
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'subagents'), { recursive: true });
  for (const one of all) await writeFile(one.file, one.body, 'utf8');
  console.log(`geschrieben nach ${path.relative(process.cwd(), OUT)}`);
}

await main();
