/**
 * Die Regeln der Mind Map, die im Schema nicht stehen dürfen.
 *
 * Structured Outputs nehmen keine Längen- und Anzahlgrenzen an: die API
 * streicht sie (prompts/README.md). Also stehen sie im Code, und das hier ist
 * die Stelle, an der sie nachgerechnet werden.
 *
 * Der Grundsatz jeder einzelnen: weglassen, nicht abbrechen. Ein Modell, das
 * einen Knoten falsch aufhängt, hat einen Knoten verloren und keine Karte.
 */
import { describe, expect, it } from '@jest/globals';

import { MAX_NODES, tidy, type MindMapDraft } from '../internal/mindmap.job.js';

function draft(nodes: MindMapDraft['nodes']): MindMapDraft {
  return { nodes };
}

const MAP = draft([
  { id: 'ki-vo', label: 'EU-KI-Verordnung', parentId: null },
  { id: 'risiko', label: 'Risikoklassen', parentId: 'ki-vo' },
  { id: 'verboten', label: 'Verbotene Praktiken', parentId: 'risiko' },
  { id: 'hochrisiko', label: 'Hochrisiko-Systeme', parentId: 'risiko' },
  { id: 'fristen', label: 'Geltungsdaten', parentId: 'ki-vo' },
]);

describe('the shape of a mind map', () => {
  it('keeps the root, the branches and the leaves, with their depth', () => {
    const nodes = tidy(MAP);

    // Lesereihenfolge: ein Zweig, seine Blaetter, der naechste Zweig. Ebene
    // fuer Ebene ausgegeben stuende ein Blatt unter dem falschen Zweig.
    expect(nodes.map((node) => [node.id, node.depth])).toEqual([
      ['ki-vo', 0],
      ['risiko', 1],
      ['verboten', 2],
      ['hochrisiko', 2],
      ['fristen', 1],
    ]);
  });

  it('keeps the order the model chose inside a level', () => {
    // Das Modell hat die Zweige in eine Reihenfolge gebracht, und die ist
    // besser als alphabetisch: es hat die Dokumente gelesen.
    const nodes = tidy(MAP).filter((node) => node.depth === 1);

    expect(nodes.map((node) => node.id)).toEqual(['risiko', 'fristen']);
  });

  it('drops a node whose parent does not exist', () => {
    const nodes = tidy(
      draft([
        { id: 'root', label: 'Wurzel', parentId: null },
        { id: 'lost', label: 'Haengt an nichts', parentId: 'gibt-es-nicht' },
      ])
    );

    expect(nodes.map((node) => node.id)).toEqual(['root']);
  });

  it('hangs a second root under the first instead of drawing two maps', () => {
    const nodes = tidy(
      draft([
        { id: 'a', label: 'Erste Wurzel', parentId: null },
        { id: 'b', label: 'Zweite Wurzel', parentId: null },
      ])
    );

    expect(nodes).toEqual([
      { id: 'a', label: 'Erste Wurzel', parentId: null, depth: 0 },
      { id: 'b', label: 'Zweite Wurzel', parentId: 'a', depth: 1 },
    ]);
  });

  it('keeps a branch and its leaves together', () => {
    const nodes = tidy(
      draft([
        { id: 'r', label: 'Wurzel', parentId: null },
        { id: 'a', label: 'Zweig A', parentId: 'r' },
        { id: 'b', label: 'Zweig B', parentId: 'r' },
        { id: 'a1', label: 'Blatt an A', parentId: 'a' },
        { id: 'b1', label: 'Blatt an B', parentId: 'b' },
      ])
    );

    expect(nodes.map((node) => node.id)).toEqual(['r', 'a', 'a1', 'b', 'b1']);
  });

  it('cuts off below the third level', () => {
    const nodes = tidy(
      draft([
        { id: 'r', label: 'Wurzel', parentId: null },
        { id: 'b', label: 'Zweig', parentId: 'r' },
        { id: 'l', label: 'Blatt', parentId: 'b' },
        { id: 'deep', label: 'Zu tief', parentId: 'l' },
      ])
    );

    expect(nodes.map((node) => node.id)).toEqual(['r', 'b', 'l']);
  });

  it('stops at forty nodes', () => {
    const many: MindMapDraft['nodes'] = [{ id: 'r', label: 'Wurzel', parentId: null }];
    for (let index = 0; index < 60; index += 1) {
      many.push({ id: `n${index}`, label: `Knoten ${index}`, parentId: 'r' });
    }

    expect(tidy(draft(many))).toHaveLength(MAX_NODES);
  });

  it('drops a second node with the same id', () => {
    const nodes = tidy(
      draft([
        { id: 'r', label: 'Wurzel', parentId: null },
        { id: 'x', label: 'Erster', parentId: 'r' },
        { id: 'x', label: 'Zweiter mit derselben Id', parentId: 'r' },
      ])
    );

    expect(nodes.map((node) => node.label)).toEqual(['Wurzel', 'Erster']);
  });

  it('drops a node without a label and one without an id', () => {
    const nodes = tidy(
      draft([
        { id: 'r', label: 'Wurzel', parentId: null },
        { id: 'leer', label: '   ', parentId: 'r' },
        { id: '  ', label: 'Ohne Id', parentId: 'r' },
      ])
    );

    expect(nodes.map((node) => node.id)).toEqual(['r']);
  });

  it('breaks a cycle by dropping what hangs in it', () => {
    // Zwei Knoten, die einander als Elternteil nennen, haengen an keiner
    // Wurzel. Sie fallen weg; die Karte bleibt.
    const nodes = tidy(
      draft([
        { id: 'r', label: 'Wurzel', parentId: null },
        { id: 'a', label: 'A', parentId: 'b' },
        { id: 'b', label: 'B', parentId: 'a' },
      ])
    );

    expect(nodes.map((node) => node.id)).toEqual(['r']);
  });

  it('returns nothing when the model named no root', () => {
    // Eine Karte ohne Wurzel ist keine Karte. Der Job macht daraus einen
    // Fehlschlag mit einem Satz, keine halbe Zeichnung.
    expect(tidy(draft([{ id: 'a', label: 'A', parentId: 'b' }]))).toEqual([]);
  });

  it('trims a label that is a sentence', () => {
    const long = 'Ein Label, das in Wahrheit ein ganzer Satz ist und deshalb '.repeat(3);
    const nodes = tidy(
      draft([
        { id: 'r', label: 'Wurzel', parentId: null },
        { id: 'lang', label: long, parentId: 'r' },
      ])
    );

    expect(nodes[1].label.length).toBeLessThanOrEqual(80);
  });
});
