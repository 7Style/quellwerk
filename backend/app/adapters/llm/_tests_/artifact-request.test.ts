import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { buildArtifactRequest } from '../artifact-request.js';
import type { DocumentSource } from '../documents.js';
import { notebookOverviewSchema } from '../../../modules/notebooks/internal/overview.job.js';
import {
  notebookTitleSchema,
  sourceGuideSchema,
} from '../../../modules/sources/internal/ingest.job.js';

const sources: DocumentSource[] = [
  { id: 'a', position: 1, title: 'Eins', kind: 'md', text: 'erster Text' },
  { id: 'b', position: 2, title: 'Zwei', kind: 'pdf', text: 'zweiter Text', pageCount: 3 },
];

const schema = z.object({ summary: z.string(), topics: z.array(z.string()) });

function contentOf(request: ReturnType<typeof buildArtifactRequest>) {
  return request.messages[0].content as Array<Record<string, unknown>>;
}

describe('buildArtifactRequest', () => {
  it('turns citations off on every document block', () => {
    // The half of the contract that makes two builders necessary: citations and
    // structured outputs together are a 400 from the API.
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'Fasse zusammen.',
      sources,
      schema,
      maxTokens: 2_000,
    });

    const documents = contentOf(request).filter((block) => block.type === 'document');
    expect(documents).toHaveLength(2);
    expect(documents.every((block) => (block.citations as { enabled: boolean }).enabled === false)).toBe(
      true
    );
  });

  it('puts the instructions after the documents, in one user turn', () => {
    // The prompts say "the document is in the message above this text", which is
    // only true in this order. It also keeps the documents as the stable prefix.
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'Fasse zusammen.',
      sources,
      schema,
      maxTokens: 2_000,
    });

    expect(request.messages).toHaveLength(1);
    const content = contentOf(request);
    expect(content.map((block) => block.type)).toEqual(['document', 'document', 'text']);
    expect(content[2].text).toBe('Fasse zusammen.');
  });

  it('sends no system block', () => {
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources,
      schema,
      maxTokens: 100,
    });
    expect(request.system).toBeUndefined();
  });

  it('carries an output format', () => {
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources,
      schema,
      maxTokens: 100,
    });
    expect(request.output_config?.format).toBeDefined();
  });

  it('demotes a length or count constraint to prose instead of enforcing it', () => {
    // Measured, and not what I expected: zodOutputFormat does not drop these,
    // it moves them into `description` as a formatted string. So a constrained
    // schema does not constrain anything, and the constraint still ends up in
    // front of the model as machine-shaped text in the field description.
    //
    // That is the reason for the project rule "no length or count constraints
    // in a structured-output schema; enforce them in code" (prompts/README.md).
    // This test records the behaviour the rule is a response to.
    const constrained = z.object({ summary: z.string().min(10).max(500) });

    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources,
      schema: constrained,
      maxTokens: 100,
    });

    const format = request.output_config?.format as { schema: { properties: Record<string, { minLength?: number; description?: string }> } };
    const summary = format.schema.properties.summary;

    expect(summary.minLength).toBeUndefined();
    expect(summary.description).toContain('minLength: 10');
  });

  it('emits the shipped schemas with no constraint anywhere', () => {
    // The rule, checked on the three schemas that actually go to a model. If a
    // later edit adds a .min() to one of them, this fails rather than shipping
    // a description full of braces.
    for (const [name, shipped] of [
      ['source guide', sourceGuideSchema],
      ['notebook title', notebookTitleSchema],
      ['notebook overview', notebookOverviewSchema],
    ] as const) {
      const request = buildArtifactRequest({
        model: 'claude-haiku-4-5',
        instructions: 'x',
        sources,
        schema: shipped,
        maxTokens: 100,
      });

      const format = request.output_config?.format as {
        schema: { properties: Record<string, { description?: string }> };
      };

      for (const [field, property] of Object.entries(format.schema.properties)) {
        expect(`${name}.${field}: ${property.description ?? ''}`).not.toMatch(
          /min(Length|Items|imum)|max(Length|Items|imum)/
        );
      }
    }
  });

  it('passes an effort the model accepts', () => {
    const request = buildArtifactRequest({
      model: 'claude-opus-5',
      instructions: 'x',
      sources,
      schema,
      maxTokens: 100,
      effort: 'low',
    });
    expect(request.output_config?.effort).toBe('low');
  });

  it('drops the effort on the fast model, which rejects the parameter', () => {
    // Haiku 4.5 answers 400 for output_config.effort (ADR-0011). Dropping it
    // here is what lets one builder serve both models.
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources,
      schema,
      maxTokens: 100,
      effort: 'low',
    });
    expect(request.output_config?.effort).toBeUndefined();
  });

  it('sets no cache breakpoint unless one is asked for', () => {
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources,
      schema,
      maxTokens: 100,
    });
    expect(contentOf(request).every((block) => block.cache_control === undefined)).toBe(true);
  });

  it('never sets the one hour breakpoint, only the five minute one', () => {
    // The hour belongs to the chat, whose documents are read again on every
    // turn. An artifact is written once (prompts/README.md, cache rule 4).
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources,
      schema,
      maxTokens: 100,
      cache5m: true,
    });

    const documents = contentOf(request).filter((block) => block.type === 'document');
    expect(documents[0].cache_control).toBeUndefined();
    expect(documents[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(JSON.stringify(request)).not.toContain('1h');
  });

  it('keeps the documents in position order', () => {
    const request = buildArtifactRequest({
      model: 'claude-haiku-4-5',
      instructions: 'x',
      sources: [sources[1], sources[0]],
      schema,
      maxTokens: 100,
    });

    const titles = contentOf(request)
      .filter((block) => block.type === 'document')
      .map((block) => block.title);
    expect(titles).toEqual(['Eins', 'Zwei']);
  });
});
