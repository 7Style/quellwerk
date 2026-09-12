/**
 * Copy-on-first-write: der erste Schreibzugriff auf das Demo-Notizbuch legt eine
 * Kopie in der eigenen Sitzung an, und das Original bleibt, wie es war.
 *
 * Aus docs/PLAN.md M7-T1. Zwei Dinge werden hier geprüft, und das zweite ist
 * das, was eine halbe Umsetzung durchgehen lassen würde: dass der Aufrufer die
 * Id der Kopie zurückbekommt. Wer weiter mit der Id aus der Route arbeitet,
 * schreibt ins Original -- also in das, was alle anderen sehen.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';

import { writeDecision } from '../copy-on-write.js';
import { NotebooksService } from '../../services/notebooks.service.js';
import type {
  CreateNotebookData,
  NotebookRow,
  NotebooksRepository,
} from '../../interfaces/notebooks.repository.js';

const DEMO = 'demo';

function row(overrides: Partial<NotebookRow> = {}): NotebookRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    sessionId: 'session-a',
    title: 'Mine',
    emoji: null,
    userSetTitle: false,
    summary: null,
    suggestedQuestions: null,
    tokenCount: 0,
    tokenModel: null,
    sourceCount: 0,
    isDemo: false,
    createdAt: new Date('2026-09-11T12:00:00Z'),
    lastUsedAt: new Date('2026-09-11T12:00:00Z'),
    ...overrides,
  };
}

const demoRow = (): NotebookRow =>
  row({
    id: DEMO,
    sessionId: null,
    isDemo: true,
    title: 'EU-KI-Verordnung',
    summary: 'Vier Quellen zur KI-Verordnung.',
    tokenCount: 63_431,
    sourceCount: 4,
  });

/* -------------------------------------------------------------------------- */
/* Die Regel                                                                   */
/* -------------------------------------------------------------------------- */

describe('the decision a write needs', () => {
  it('writes straight into a notebook of this session', () => {
    expect(writeDecision(row(), 'session-a')).toEqual({ kind: 'own' });
  });

  it('copies the demo notebook instead of writing into it', () => {
    expect(writeDecision(demoRow(), 'anyone')).toEqual({ kind: 'copy' });
  });

  it('refuses a notebook of another session', () => {
    expect(writeDecision(row({ sessionId: 'session-b' }), 'session-a')).toEqual({
      kind: 'refuse',
    });
  });

  it('refuses a notebook that does not exist', () => {
    expect(writeDecision(null, 'session-a')).toEqual({ kind: 'refuse' });
  });

  it('refuses the demo notebook for a write that cannot create anything', () => {
    // "Nochmal versuchen" an einem Report: die Kopie wäre ein leeres Notizbuch,
    // in dem die Zeile fehlt, um die es ging.
    expect(writeDecision(demoRow(), 'anyone', false)).toEqual({ kind: 'refuse' });
  });

  it('still writes into an own notebook when nothing may be created', () => {
    expect(writeDecision(row(), 'session-a', false)).toEqual({ kind: 'own' });
  });
});

/* -------------------------------------------------------------------------- */
/* Der Dienst, gegen eine Ablage im Speicher                                   */
/* -------------------------------------------------------------------------- */

class InMemoryNotebooks implements NotebooksRepository {
  readonly rows: Array<NotebookRow & { clonedFrom?: string }> = [];
  /** Wie oft wirklich kopiert wurde, nicht wie oft gefragt wurde. */
  copies = 0;
  private next = 0;

  async create(data: CreateNotebookData): Promise<NotebookRow> {
    const created = row({ id: `nb-${(this.next += 1)}`, sessionId: data.sessionId, title: data.title });
    this.rows.push(created);
    return created;
  }

  async findById(id: string): Promise<NotebookRow | null> {
    return this.rows.find((one) => one.id === id) ?? null;
  }

  async copyForSession(sourceId: string, sessionId: string): Promise<NotebookRow> {
    const existing = this.rows.find(
      (one) => one.clonedFrom === sourceId && one.sessionId === sessionId
    );
    if (existing) return existing;

    const original = this.rows.find((one) => one.id === sourceId);
    if (!original) throw new Error(`no notebook ${sourceId}`);

    this.copies += 1;
    const copy = {
      ...original,
      id: `copy-${this.copies}`,
      sessionId,
      isDemo: false,
      clonedFrom: sourceId,
    };
    this.rows.push(copy);
    return copy;
  }

  async listBySession(sessionId: string): Promise<NotebookRow[]> {
    return this.rows
      .filter((one) => one.sessionId === sessionId || one.isDemo)
      .sort((a, b) => Number(a.isDemo) - Number(b.isDemo));
  }

  async touch(): Promise<void> {
    // nichts zu tun
  }
}

let repository: InMemoryNotebooks;
let service: NotebooksService;

beforeEach(() => {
  repository = new InMemoryNotebooks();
  repository.rows.push(demoRow());
  service = new NotebooksService({ repository });
});

describe('the first write to the demo notebook', () => {
  it('hands back a copy of this session, not the demo notebook', async () => {
    const target = await service.writableOrCopy(DEMO, 'visitor');

    expect(target.id).not.toBe(DEMO);
    expect(target.sessionId).toBe('visitor');
    expect(target.isDemo).toBe(false);
  });

  it('carries the notebook over, so the copy is not an empty notebook', async () => {
    const target = await service.writableOrCopy(DEMO, 'visitor');

    expect(target.title).toBe('EU-KI-Verordnung');
    expect(target.summary).toBe('Vier Quellen zur KI-Verordnung.');
    expect(target.tokenCount).toBe(63_431);
    expect(target.sourceCount).toBe(4);
  });

  it('leaves the original untouched', async () => {
    await service.writableOrCopy(DEMO, 'visitor');

    const demo = await service.readable(DEMO, 'somebody-else');
    expect(demo.sessionId).toBeNull();
    expect(demo.isDemo).toBe(true);
    expect(demo.id).toBe(DEMO);
  });

  it('copies once per session, not once per write', async () => {
    // Zwei Uploads hintereinander sind ein Notizbuch mit zwei Quellen und nicht
    // zwei Notizbücher.
    const first = await service.writableOrCopy(DEMO, 'visitor');
    const second = await service.writableOrCopy(DEMO, 'visitor');

    expect(second.id).toBe(first.id);
    expect(repository.copies).toBe(1);
  });

  it('gives every session its own copy', async () => {
    const mine = await service.writableOrCopy(DEMO, 'visitor-a');
    const yours = await service.writableOrCopy(DEMO, 'visitor-b');

    expect(yours.id).not.toBe(mine.id);
    expect(repository.copies).toBe(2);
  });

  it('puts the copy in the list of its own session and in no other', async () => {
    const copy = await service.writableOrCopy(DEMO, 'visitor-a');

    const mine = await service.list('visitor-a');
    const other = await service.list('visitor-b');

    expect(mine.map((one) => one.id)).toEqual([copy.id, DEMO]);
    expect(other.map((one) => one.id)).toEqual([DEMO]);
  });

  it('refuses a write that cannot create anything, and copies nothing', async () => {
    await expect(service.writable(DEMO, 'visitor')).rejects.toThrow('No such notebook.');
    expect(repository.copies).toBe(0);
  });

  it('writes into an own notebook without copying it', async () => {
    const own = await service.create('session-a', 'Mine');

    const target = await service.writableOrCopy(own.id, 'session-a');

    expect(target.id).toBe(own.id);
    expect(repository.copies).toBe(0);
  });
});
