import { describe, expect, it, vi } from 'vitest';
import { isSharedOutsideTeam } from './ownership';

const link = (id: string) => ({ sys: { type: 'Link', linkType: 'Entry', id } });
const parentEntry = (id: string, createdBy: string, fields: Record<string, Record<string, unknown>>) => ({
  sys: { id, createdBy: { sys: { id: createdBy } } },
  fields,
});

// Answers links_to_entry queries from a child id -> linking entries table.
const cmaWithLinks = (incoming: Record<string, unknown[]>) => ({
  entry: {
    getMany: vi.fn(async ({ query }: { query: { links_to_entry: string } }) => {
      const items = incoming[query.links_to_entry] ?? [];
      return { items, total: items.length };
    }),
  },
});

const isUkMember = (userId: string | undefined) => userId === 'uk-1' || userId === 'uk-2';

describe('isSharedOutsideTeam', () => {
  it('is not shared when nothing links to the entry', async () => {
    const cma: any = cmaWithLinks({});
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(false);
  });

  it("is not shared when another team's entry links to it only in the team's own locale", async () => {
    const cma: any = cmaWithLinks({
      slide: [
        parentEntry('slider', 'us-admin', { slides: { 'en-GB': [link('slide')], 'en-US': [link('us-slide')] } }),
      ],
    });
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(false);
  });

  it("is shared when another team's entry links to it in the default locale", async () => {
    const cma: any = cmaWithLinks({
      slide: [parentEntry('slider', 'us-admin', { slides: { 'en-US': [link('slide')] } })],
    });
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(true);
  });

  it('finds links embedded in rich text', async () => {
    const cma: any = cmaWithLinks({
      card: [
        parentEntry('article', 'us-admin', {
          text: {
            'en-US': {
              nodeType: 'document',
              content: [{ nodeType: 'embedded-entry-block', data: { target: link('card') }, content: [] }],
            },
          },
        }),
      ],
    });
    expect(await isSharedOutsideTeam(cma, 'card', ['en-GB'], isUkMember)).toBe(true);
  });

  it("follows a teammate's entry upwards and stops at a link in the team's own locale", async () => {
    const cma: any = cmaWithLinks({
      slide: [parentEntry('slider', 'uk-2', { slides: { 'en-US': [link('slide')] } })],
      slider: [parentEntry('page', 'us-admin', { sections: { 'en-GB': [link('slider')] } })],
    });
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(false);
  });

  it("is shared when a teammate's entry is itself linked from another team in the default locale", async () => {
    const cma: any = cmaWithLinks({
      slide: [parentEntry('slider', 'uk-2', { slides: { 'en-US': [link('slide')] } })],
      slider: [parentEntry('page', 'us-admin', { sections: { 'en-US': [link('slider')] } })],
    });
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(true);
  });

  it('treats a failed lookup as shared', async () => {
    const cma: any = { entry: { getMany: vi.fn().mockRejectedValue(new Error('Forbidden')) } };
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(true);
  });

  it('treats more links than one page returns as shared', async () => {
    const cma: any = { entry: { getMany: vi.fn().mockResolvedValue({ items: [], total: 101 }) } };
    expect(await isSharedOutsideTeam(cma, 'slide', ['en-GB'], isUkMember)).toBe(true);
  });

  it('treats a chain of teammate links deeper than it checks as shared', async () => {
    const incoming: Record<string, unknown[]> = {};
    for (let level = 0; level < 6; level++) {
      incoming[`entry-${level}`] = [
        parentEntry(`entry-${level + 1}`, 'uk-2', { child: { 'en-US': link(`entry-${level}`) } }),
      ];
    }
    const cma: any = cmaWithLinks(incoming);
    expect(await isSharedOutsideTeam(cma, 'entry-0', ['en-GB'], isUkMember)).toBe(true);
  });
});
