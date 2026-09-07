import type { Document, Node, Text } from '@contentful/rich-text-types';

const isTextNode = (node: Node): node is Text => node.nodeType === 'text';

// Walks a rich text document and returns every text node's value, in document order -
// the same order applyTranslatedSegments expects its replacements back in.
export const extractTextSegments = (document: Document): string[] => {
  const segments: string[] = [];

  const walk = (node: Node) => {
    if (isTextNode(node)) {
      segments.push(node.value);
      return;
    }
    const content = (node as { content?: Node[] }).content;
    content?.forEach(walk);
  };

  document.content.forEach(walk);
  return segments;
};

// Returns a deep copy of the document with each text node's value replaced by the
// corresponding translated segment, preserving every mark and non-text node untouched.
export const applyTranslatedSegments = (document: Document, translations: string[]): Document => {
  let index = 0;

  const walk = <T extends Node>(node: T): T => {
    if (isTextNode(node)) {
      const value = index < translations.length ? translations[index] : node.value;
      index += 1;
      return { ...node, value } as T;
    }
    const content = (node as unknown as { content?: Node[] }).content;
    if (!content) return node;
    return { ...node, content: content.map(walk) } as T;
  };

  return {
    ...document,
    content: document.content.map(walk),
  };
};
