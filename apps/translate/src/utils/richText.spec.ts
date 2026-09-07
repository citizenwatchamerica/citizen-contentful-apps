import { BLOCKS } from '@contentful/rich-text-types';
import type { Document } from '@contentful/rich-text-types';
import { describe, expect, it } from 'vitest';
import { applyTranslatedSegments, extractTextSegments } from './richText';

const doc: Document = {
  nodeType: BLOCKS.DOCUMENT,
  data: {},
  content: [
    {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [
        { nodeType: 'text', value: 'Hello', marks: [], data: {} },
        { nodeType: 'text', value: ' world', marks: [{ type: 'bold' }], data: {} },
      ],
    },
    {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{ nodeType: 'text', value: 'Second paragraph', marks: [], data: {} }],
    },
  ],
} as Document;

describe('extractTextSegments', () => {
  it('collects every text node value in document order', () => {
    expect(extractTextSegments(doc)).toEqual(['Hello', ' world', 'Second paragraph']);
  });
});

describe('applyTranslatedSegments', () => {
  it('replaces each text node value in order while preserving marks and structure', () => {
    const translated = applyTranslatedSegments(doc, ['Hola', ' mundo', 'Segundo párrafo']);

    expect(extractTextSegments(translated)).toEqual(['Hola', ' mundo', 'Segundo párrafo']);
    // marks on the second text node must survive untouched
    expect((translated.content[0].content[1] as any).marks).toEqual([{ type: 'bold' }]);
    // original document must not be mutated
    expect(extractTextSegments(doc)).toEqual(['Hello', ' world', 'Second paragraph']);
  });

  it('leaves a node unchanged if fewer translations are provided than text nodes', () => {
    const translated = applyTranslatedSegments(doc, ['Hola']);

    expect(extractTextSegments(translated)).toEqual(['Hola', ' world', 'Second paragraph']);
  });
});
