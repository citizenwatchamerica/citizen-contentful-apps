import { describe, expect, it, vi } from 'vitest';
import { getLinkedContent } from './linkedContent';

const entryLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Entry', id } });
const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } });

const entry = (id: string, fields: Record<string, Record<string, unknown>>, sys: Record<string, unknown> = {}) => ({
  sys: { id, version: 3, contentType: { sys: { id: 'slide' } }, createdBy: { sys: { id: 'uk-1' } }, ...sys },
  fields,
});

// A CMA that serves the root plus a table of linked entries and assets by id.
const cmaWith = (root: unknown, entries: unknown[] = [], assets: unknown[] = [], published: unknown[] = []) => {
  const byIds = (items: any[]) =>
    vi.fn(async ({ query }: { query: Record<string, string> }) => {
      const ids = query['sys.id[in]'].split(',');
      return { items: items.filter(item => ids.includes(item.sys.id)) };
    });
  return {
    entry: { get: vi.fn().mockResolvedValue(root), getMany: byIds(entries), getPublished: byIds(published) },
    asset: { getMany: byIds(assets) },
    contentType: {
      get: vi.fn().mockResolvedValue({
        displayField: 'title',
        fields: [
          { id: 'title', name: 'Title', localized: true },
          { id: 'image', name: 'Image', localized: true },
          { id: 'focalPoint', name: 'Focal point', localized: false },
          { id: 'internalName', name: 'Internal name', localized: false },
        ],
      }),
    },
  };
};

const options = { locales: ['en-GB'], defaultLocale: 'en-US', fallbacks: { 'en-GB': 'en-US' } };

describe('getLinkedContent', () => {
  it('lists draft entries and assets linked in the given locales, nested ones included, with the root field they hang off', async () => {
    const cma: any = cmaWith(
      entry('page', { slides: { 'en-GB': [entryLink('slide')] } }),
      [entry('slide', { title: { 'en-US': 'UK slide' }, image: { 'en-GB': assetLink('photo') } })],
      [{ sys: { id: 'photo', version: 2 }, fields: { title: { 'en-US': 'Hero photo' } } }]
    );

    const { items, incomplete } = await getLinkedContent(cma, 'page', ['slides'], options);

    expect(incomplete).toBe(false);
    expect(items).toEqual([
      expect.objectContaining({ id: 'slide', type: 'Entry', title: 'UK slide', status: 'draft', fieldIds: ['slides'] }),
      expect.objectContaining({ id: 'photo', type: 'Asset', title: 'Hero photo', isFirstPublish: true, fieldIds: ['slides'] }),
    ]);
  });

  it("ignores links that only show in other teams' locales", async () => {
    const cma: any = cmaWith(
      entry('page', { slides: { 'en-US': [entryLink('us-slide')], 'en-GB': [] } }),
      [entry('us-slide', {})]
    );

    const { items } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(items).toEqual([]);
  });

  it('follows the fallback chain when the locale has no value of its own', async () => {
    const cma: any = cmaWith(entry('page', { slides: { 'en-US': [entryLink('slide')] } }), [entry('slide', {})]);

    const { items } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(items.map(item => item.id)).toEqual(['slide']);
  });

  it('counts a non-localized reference field for every locale', async () => {
    const cma: any = cmaWith(entry('page', { hero: { 'en-US': entryLink('slide') } }), [entry('slide', {})]);

    const { items } = await getLinkedContent(cma, 'page', [], { ...options, fallbacks: {} });
    expect(items.map(item => item.id)).toEqual(['slide']);
  });

  it('skips linked content already published in those locales, and archived content', async () => {
    const cma: any = cmaWith(entry('page', { slides: { 'en-GB': [entryLink('live'), entryLink('archived')] } }), [
      entry('live', {}, { publishedVersion: 2, fieldStatus: { '*': { 'en-GB': 'published', 'en-US': 'changed' } } }),
      entry('archived', {}, { archivedVersion: 2 }),
    ]);

    const { items } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(items).toEqual([]);
  });

  it('still walks through published entries to reach drafts beneath them', async () => {
    const cma: any = cmaWith(entry('page', { slides: { 'en-GB': [entryLink('slider')] } }), [
      entry('slider', { title: { 'en-GB': [entryLink('slide')] } }, { publishedVersion: 2 }),
      entry('slide', {}),
    ]);

    const { items } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(items.map(item => item.id)).toEqual(['slide']);
  });

  it("offers an entry that's published in the region but has changed shared fields, naming them", async () => {
    // Shared (non-localized) fields live under en-US, so publishing en-GB alone never sends them.
    const upToDateInRegion = { publishedVersion: 18, version: 20, fieldStatus: { '*': { 'en-GB': 'published', 'en-US': 'changed' } } };
    const cma: any = cmaWith(
      entry('page', { slides: { 'en-GB': [entryLink('focal'), entryLink('same')] } }),
      [
        entry('focal', { focalPoint: { 'en-US': { x: 744 } }, internalName: { 'en-US': 'Same' } }, upToDateInRegion),
        entry('same', { focalPoint: { 'en-US': { x: 1 } } }, upToDateInRegion),
      ],
      [],
      [
        entry('focal', { focalPoint: { 'en-US': { x: 1920 } }, internalName: { 'en-US': 'Same' } }),
        entry('same', { focalPoint: { 'en-US': { x: 1 } } }),
      ]
    );

    const { items } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(items).toEqual([
      expect.objectContaining({ id: 'focal', status: 'changed', sharedFieldChanges: ['Focal point'] }),
    ]);
  });

  it("reports the root entry's own shared-field changes", async () => {
    const cma: any = cmaWith(
      entry('page', { internalName: { 'en-US': 'New name' } }, { publishedVersion: 3, version: 5 }),
      [],
      [],
      [entry('page', { internalName: { 'en-US': 'Old name' } })]
    );

    const { rootSharedFieldChanges } = await getLinkedContent(cma, 'page', [], options);
    expect(rootSharedFieldChanges).toEqual(['Internal name']);
  });

  it("flags the list as incomplete when the published copies can't be read", async () => {
    const cma: any = cmaWith(
      entry('page', { slides: { 'en-GB': [entryLink('focal')] } }),
      [entry('focal', {}, { publishedVersion: 2, version: 5, fieldStatus: { '*': { 'en-GB': 'published', 'en-US': 'changed' } } })]
    );
    cma.entry.getPublished.mockRejectedValue(new Error('Forbidden'));

    const { items, incomplete } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(items).toEqual([]);
    expect(incomplete).toBe(true);
  });

  it('flags the list as incomplete when a lookup fails', async () => {
    const cma: any = cmaWith(entry('page', { slides: { 'en-GB': [entryLink('slide')] } }));
    cma.entry.getMany.mockRejectedValue(new Error('Forbidden'));

    const { incomplete } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(incomplete).toBe(true);
  });
});
