import type { CMAClient } from '@contentful/app-sdk';

// Page > section > slider > slide is about as deep as linking goes in these spaces.
const MAX_DEPTH = 5;
const MAX_ENTRIES = 25;
const PAGE_SIZE = 100;

export type LinkType = 'Entry' | 'Asset';

const linksTo = (value: unknown, id: string, linkType: LinkType): boolean => {
  if (Array.isArray(value)) return value.some(item => linksTo(item, id, linkType));
  if (!value || typeof value !== 'object') return false;

  const sys = (value as { sys?: { type?: string; linkType?: string; id?: string } }).sys;
  if (sys?.type === 'Link' && sys.linkType === linkType && sys.id === id) return true;

  // Covers rich text too, where embedded entries sit deeper under `content[].data.target`.
  return Object.values(value).some(child => linksTo(child, id, linkType));
};

// Whether an entry can surface anywhere outside its owning team's locales, by walking the
// entries that link to it. A link held only in the team's own locales (e.g. a UK slide slotted
// into a US page's en-GB field) never shows the entry to anyone else, so that branch stops. A
// link in any other locale - including a non-localized field, which lives under the default
// locale - is fine only when the linking entry is itself team-owned and passes the same check.
// Anything it can't fully verify (a failed lookup, too many links, too deep) counts as shared.
// Works for an asset too - only the first hop differs, since only entries can link onwards.
export const isSharedOutsideTeam = async (
  cma: CMAClient,
  entityId: string,
  teamLocales: string[],
  isTeamMember: (userId: string | undefined) => boolean,
  linkType: LinkType = 'Entry'
): Promise<boolean> => {
  const visited = new Set([entityId]);
  let frontier: Array<{ id: string; linkType: LinkType }> = [{ id: entityId, linkType }];

  try {
    for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
      const nextFrontier: typeof frontier = [];

      for (const child of frontier) {
        const linkQuery = child.linkType === 'Asset' ? { links_to_asset: child.id } : { links_to_entry: child.id };
        const { items, total } = await cma.entry.getMany({
          query: { ...linkQuery, limit: PAGE_SIZE },
        });
        if (total > items.length) return true;

        for (const parent of items) {
          const linksOutsideTeamLocales = Object.values(parent.fields ?? {}).some(field =>
            Object.entries(field ?? {}).some(
              ([locale, value]) => !teamLocales.includes(locale) && linksTo(value, child.id, child.linkType)
            )
          );
          if (!linksOutsideTeamLocales) continue;
          if (!isTeamMember(parent.sys.createdBy?.sys.id)) return true;

          if (!visited.has(parent.sys.id)) {
            visited.add(parent.sys.id);
            nextFrontier.push({ id: parent.sys.id, linkType: 'Entry' });
          }
        }
      }

      if (visited.size > MAX_ENTRIES) return true;
      frontier = nextFrontier;
    }

    return frontier.length > 0;
  } catch {
    return true;
  }
};
