import { describe, expect, it, vi } from 'vitest';
import { getLinkedContent } from './linkedContent';

const entryLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Entry', id } });
const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } });

const entry = (id: string, fields: Record<string, Record<string, unknown>>, sys: Record<string, unknown> = {}) => ({
  sys: { id, version: 3, contentType: { sys: { id: 'slide' } }, createdBy: { sys: { id: 'uk-1' } }, ...sys },
  fields,
});

// A CMA that serves the root plus a table of linked entries and assets by id.
const cmaWith = (root: unknown, entries: unknown[] = [], assets: unknown[] = []) => {
  const byIds = (items: any[]) =>
    vi.fn(async ({ query }: { query: Record<string, string> }) => {
      const ids = query['sys.id[in]'].split(',');
      return { items: items.filter(item => ids.includes(item.sys.id)) };
    });
  return {
    entry: { get: vi.fn().mockResolvedValue(root), getMany: byIds(entries) },
    asset: { getMany: byIds(assets) },
    contentType: {
      get: vi.fn().mockResolvedValue({
        displayField: 'title',
        fields: [
          { id: 'title', localized: true },
          { id: 'image', localized: true },
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

  it('flags the list as incomplete when a lookup fails', async () => {
    const cma: any = cmaWith(entry('page', { slides: { 'en-GB': [entryLink('slide')] } }));
    cma.entry.getMany.mockRejectedValue(new Error('Forbidden'));

    const { incomplete } = await getLinkedContent(cma, 'page', ['slides'], options);
    expect(incomplete).toBe(true);
  });
});
