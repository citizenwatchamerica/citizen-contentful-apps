import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import { describe, expect, it, vi } from 'vitest';
import {
  ContentModel,
  RawEntry,
  buildCsv,
  loadEntries,
  parseEntryIds,
  planEntry,
  summarizePlans,
  translateEntry,
} from './bulkTranslate';

const config = { source: 'en-US', target: 'en-CA', guidance: 'Canadian English' };

const model: ContentModel = {
  contentTypes: new Map([
    [
      'hero',
      {
        sys: { id: 'hero' },
        name: 'Hero',
        displayField: 'internalName',
        fields: [
          { id: 'internalName', name: 'Internal name', type: 'Symbol', localized: false },
          { id: 'title', name: 'Title', type: 'Symbol', localized: true },
          { id: 'subtitle', name: 'Subtitle', type: 'Symbol', localized: true },
          { id: 'text', name: 'Text', type: 'RichText', localized: true },
          { id: 'categoryId', name: 'Category ID', type: 'Symbol', localized: true },
          { id: 'image', name: 'Image', type: 'Link', localized: true },
        ],
      },
    ],
  ]),
  controls: new Map(),
};

const richText = (value: string) => ({
  nodeType: BLOCKS.DOCUMENT,
  data: {},
  content: [
    {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [
        { nodeType: 'text', value, marks: [{ type: 'bold' }], data: {} },
        {
          nodeType: INLINES.HYPERLINK,
          data: { uri: 'https://www.bulova.com/us' },
          content: [{ nodeType: 'text', value: 'Shop now', marks: [], data: {} }],
        },
      ],
    },
  ],
});

const makeEntry = (fields: RawEntry['fields'], version = 5): RawEntry => ({
  sys: { id: 'entry-1', version, contentType: { sys: { id: 'hero' } } },
  fields,
});

const okCall = (translate: (text: string) => string) =>
  vi.fn(async (_params, { parameters }) => {
    const { texts } = JSON.parse(parameters.payload);
    return { statusCode: 200, errors: [], response: { body: JSON.stringify({ translations: texts.map(translate) }) } };
  });

const makeCma = (entry: RawEntry) => ({
  entry: {
    getMany: vi.fn(),
    get: vi.fn(async () => structuredClone(entry)),
    update: vi.fn(async (_params, updated: RawEntry) => updated),
  },
  contentType: { getMany: vi.fn() },
  editorInterface: { getMany: vi.fn() },
  appActionCall: { createWithResponse: okCall(text => `${text} (CA)`) },
});

describe('parseEntryIds', () => {
  it('splits on newlines, commas and spaces and removes duplicates', () => {
    expect(parseEntryIds('abc\n def,ghi\n\nabc ')).toEqual(['abc', 'def', 'ghi']);
  });
});

describe('planEntry', () => {
  it('only counts a value explicitly stored in the target locale as existing - never fallback', () => {
    const entry = makeEntry({
      internalName: { 'en-US': 'Hero - Marine Star' },
      title: { 'en-US': 'Marine Star', 'en-CA': 'Marine Star' },
      subtitle: { 'en-US': 'Built for the sea' },
      text: { 'en-US': richText('Discover the color') },
      categoryId: { 'en-US': 'mens-watches' },
      image: { 'en-US': { sys: { type: 'Link', linkType: 'Asset', id: 'asset-1' } } },
    });

    const plan = planEntry(entry, model, config);
    const statusOf = (fieldId: string) => plan.fields.find(field => field.fieldId === fieldId)?.status;

    expect(plan.displayName).toBe('Hero - Marine Star');
    expect(statusOf('title')).toBe('existing');
    expect(statusOf('subtitle')).toBe('translate');
    expect(statusOf('text')).toBe('translate');
    expect(statusOf('categoryId')).toBe('excluded');
    expect(statusOf('image')).toBe('excluded');
    expect(statusOf('internalName')).toBe('excluded');
  });

  it('treats an empty stored target value as missing', () => {
    const plan = planEntry(makeEntry({ subtitle: { 'en-US': 'Hello', 'en-CA': '  ' } }), model, config);
    expect(plan.fields.find(field => field.fieldId === 'subtitle')?.status).toBe('translate');
  });

  it('excludes Symbol values that are URLs or codes even in a copy field', () => {
    const plan = planEntry(makeEntry({ subtitle: { 'en-US': 'https://www.bulova.com' } }), model, config);
    expect(plan.fields.find(field => field.fieldId === 'subtitle')).toMatchObject({
      status: 'excluded',
      reason: 'Value is a URL',
    });
  });

  it('totals plans for the dry-run summary', () => {
    const totals = summarizePlans([
      planEntry(makeEntry({ title: { 'en-US': 'A', 'en-CA': 'A' }, subtitle: { 'en-US': 'B' } }), model, config),
    ]);
    expect(totals).toMatchObject({ entries: 1, entriesWithWork: 1, translate: 1, existing: 1 });
  });
});

describe('loadEntries', () => {
  it('reports IDs that were not found or are archived', async () => {
    const live = makeEntry({});
    const archived = { ...makeEntry({}), sys: { ...makeEntry({}).sys, id: 'entry-2', archivedVersion: 3 } };
    const cma = makeCma(live);
    cma.entry.getMany.mockResolvedValue({ items: [live, archived] });

    const loaded = await loadEntries(cma as any, ['entry-1', 'entry-2', 'missing']);
    expect(loaded.entries.map(entry => entry.sys.id)).toEqual(['entry-1']);
    expect(loaded.archived).toEqual(['entry-2']);
    expect(loaded.notFound).toEqual(['missing']);
  });
});

describe('translateEntry', () => {
  const request = (cma: ReturnType<typeof makeCma>) => ({
    cma: cma as any,
    appDefinitionId: 'app',
    model,
    config,
    protectedTerms: ['Marine Star'],
  });

  it('writes only empty target-locale copy fields, leaves the source untouched and never publishes', async () => {
    const entry = makeEntry({
      title: { 'en-US': 'Marine Star', 'en-CA': 'Existing CA title' },
      subtitle: { 'en-US': 'Built for the sea' },
      text: { 'en-US': richText('Discover the color') },
      categoryId: { 'en-US': 'mens-watches' },
    });
    const cma = makeCma(entry);

    const result = await translateEntry(request(cma), 'entry-1');

    expect(result.outcome).toBe('translated');
    expect(cma.entry.update).toHaveBeenCalledTimes(1);
    const written = cma.entry.update.mock.calls[0][1] as any;
    expect(written.sys.version).toBe(5);
    expect(written.fields.title).toEqual({ 'en-US': 'Marine Star', 'en-CA': 'Existing CA title' });
    expect(written.fields.subtitle).toEqual({ 'en-US': 'Built for the sea', 'en-CA': 'Built for the sea (CA)' });
    expect(written.fields.categoryId).toEqual({ 'en-US': 'mens-watches' });
    expect(written.fields.text['en-US']).toEqual(richText('Discover the color'));

    const translatedParagraph = written.fields.text['en-CA'].content[0];
    expect(translatedParagraph.content[0]).toMatchObject({ value: 'Discover the color (CA)', marks: [{ type: 'bold' }] });
    expect(translatedParagraph.content[1]).toMatchObject({
      nodeType: INLINES.HYPERLINK,
      data: { uri: 'https://www.bulova.com/us' },
    });

    // Every field's segments go out in a single App Action call, with the protected terms.
    expect(cma.appActionCall.createWithResponse).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(cma.appActionCall.createWithResponse.mock.calls[0][1].parameters.payload);
    expect(payload).toMatchObject({ sourceLocale: 'en-US', targetLocale: 'en-CA', protectedTerms: ['Marine Star'] });
    expect(Object.keys(cma)).not.toContain('publish');
  });

  it('skips an entry with nothing left to translate without calling OpenAI', async () => {
    const cma = makeCma(makeEntry({ title: { 'en-US': 'A', 'en-CA': 'B' } }));
    const result = await translateEntry(request(cma), 'entry-1');
    expect(result.outcome).toBe('skipped');
    expect(cma.appActionCall.createWithResponse).not.toHaveBeenCalled();
    expect(cma.entry.update).not.toHaveBeenCalled();
  });

  it('re-reads and retries on a version conflict without paying for the translation twice', async () => {
    const cma = makeCma(makeEntry({ subtitle: { 'en-US': 'Hello' } }));
    cma.entry.update
      .mockRejectedValueOnce({ message: JSON.stringify({ status: 409, message: 'VersionMismatch' }) } as any)
      .mockImplementation(async (_params, updated: RawEntry) => updated);

    const result = await translateEntry(request(cma), 'entry-1');

    expect(result.outcome).toBe('translated');
    expect(cma.entry.get).toHaveBeenCalledTimes(2);
    expect(cma.entry.update).toHaveBeenCalledTimes(2);
    expect(cma.appActionCall.createWithResponse).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a target value someone added during the run', async () => {
    const cma = makeCma(makeEntry({ subtitle: { 'en-US': 'Hello' } }));
    cma.entry.get
      .mockResolvedValueOnce(makeEntry({ subtitle: { 'en-US': 'Hello' } }))
      .mockResolvedValueOnce(makeEntry({ subtitle: { 'en-US': 'Hello', 'en-CA': 'Edited by hand' } }, 6));
    cma.entry.update.mockRejectedValueOnce({ message: JSON.stringify({ status: 409 }) } as any);

    const result = await translateEntry(request(cma), 'entry-1');

    expect(result.outcome).toBe('skipped');
    expect(cma.entry.update).toHaveBeenCalledTimes(1);
  });

  it('reports a failure with the real error instead of throwing, so the batch can continue', async () => {
    const cma = makeCma(makeEntry({ subtitle: { 'en-US': 'Hello' } }));
    cma.appActionCall.createWithResponse.mockResolvedValue({
      statusCode: 500,
      errors: [{ message: 'OpenAI API key is not configured for this app installation.' }],
      response: { body: '' },
    } as any);

    const result = await translateEntry(request(cma), 'entry-1');

    expect(result.outcome).toBe('failed');
    expect(result.error).toMatch(/OpenAI API key is not configured/);
    expect(cma.entry.update).not.toHaveBeenCalled();
  });
});

describe('buildCsv', () => {
  it('escapes cells and lists fields by status', () => {
    const plan = planEntry(
      makeEntry({ internalName: { 'en-US': 'Hero, "main"' }, subtitle: { 'en-US': 'Hi' } }),
      model,
      config
    );
    const csv = buildCsv([{ ...plan, outcome: 'translated' }], config);
    const [header, row] = csv.split('\n');
    expect(header).toMatch(/^Entry ID,Content type,Name/);
    expect(row).toContain('"Hero, ""main"""');
    expect(row).toContain('translated,subtitle');
  });
});
