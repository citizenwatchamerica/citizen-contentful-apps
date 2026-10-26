import type { CMAClient } from '@contentful/app-sdk';
import type { EntityStatus } from '@contentful/f36-core';
import type { LinkType } from './ownership';

// A page can pull in a lot (nav, footer, every section's slides and images); stop well before
// the walk turns into hundreds of CMA calls and say the list is incomplete instead.
const MAX_ITEMS = 100;
const MAX_DEPTH = 6;
const BATCH_SIZE = 50;

export type LinkedItem = {
  id: string;
  type: LinkType;
  title: string;
  status: EntityStatus;
  // The root's locales this item shows up under, so the dialog can hide it when none of them
  // are being published.
  locales: string[];
  // The root entry's reference fields this item is reached through, directly or via other entries.
  fieldIds: string[];
  version: number;
  isFirstPublish: boolean;
  // An entry whose content type has no localized fields keeps everything under the default
  // locale, so it only goes live when the default locale is published with it.
  isSharedContentType: boolean;
  createdBy: string | null;
};

export interface LinkedContent {
  items: LinkedItem[];
  // True when the walk hit a limit or a failed lookup, so some linked content may be missing.
  incomplete: boolean;
}

interface LocaleOptions {
  locales: string[];
  defaultLocale: string;
  fallbacks: Record<string, string | undefined>;
}

interface EntitySys {
  id: string;
  version: number;
  publishedVersion?: number;
  archivedVersion?: number;
  createdBy?: { sys: { id: string } };
  contentType?: { sys: { id: string } };
  fieldStatus?: { '*'?: Record<string, string> };
}

interface Entity {
  sys: EntitySys;
  fields: Record<string, Record<string, unknown> | undefined>;
}

interface ContentTypeInfo {
  localizedFields: Set<string>;
  displayField?: string;
}

const collectLinks = (value: unknown, found: Array<{ id: string; type: LinkType }>) => {
  if (Array.isArray(value)) {
    value.forEach(item => collectLinks(item, found));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const sys = (value as { sys?: { type?: string; linkType?: string; id?: string } }).sys;
  if (sys?.type === 'Link' && (sys.linkType === 'Entry' || sys.linkType === 'Asset') && sys.id) {
    found.push({ id: sys.id, type: sys.linkType });
    return;
  }

  // Covers rich text too, where embedded entries and assets sit under `content[].data.target`.
  Object.values(value).forEach(child => collectLinks(child, found));
};

// What a field shows in a locale: a non-localized field always holds its value under the default
// locale, and a localized one left empty falls back down the locale's fallback chain.
const fieldValueIn = (
  field: Record<string, unknown> | undefined,
  locale: string,
  isLocalized: boolean,
  { defaultLocale, fallbacks }: LocaleOptions
): unknown => {
  if (!field) return undefined;
  if (!isLocalized) return field[defaultLocale];

  const seen = new Set<string>();
  let current: string | undefined = locale;
  while (current && !seen.has(current)) {
    if (field[current] !== undefined) return field[current];
    seen.add(current);
    current = fallbacks[current];
  }
  return undefined;
};

const statusOf = (sys: EntitySys): EntityStatus => {
  if (sys.archivedVersion) return 'archived';
  if (!sys.publishedVersion) return 'draft';
  if (sys.version > sys.publishedVersion + 1) return 'changed';
  return 'published';
};

// Whether any of the given locales has something unpublished. `sys.fieldStatus` gives this per
// locale (a missing locale has never been published); without it, fall back to the whole
// entity's status.
const needsPublishIn = (sys: EntitySys, locales: string[]): boolean => {
  const fieldStatus = sys.fieldStatus?.['*'];
  if (!fieldStatus) return statusOf(sys) !== 'published';
  return locales.some(locale => fieldStatus[locale] !== 'published');
};

const firstText = (field: Record<string, unknown> | undefined, defaultLocale: string): string | undefined => {
  if (!field) return undefined;
  const value = field[defaultLocale] ?? Object.values(field).find(candidate => typeof candidate === 'string');
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const fetchInBatches = async (
  ids: string[],
  fetchBatch: (batch: string[]) => Promise<{ items: unknown[] }>
): Promise<Entity[]> => {
  const results: Entity[] = [];
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const { items } = await fetchBatch(ids.slice(start, start + BATCH_SIZE));
    results.push(...(items as Entity[]));
  }
  return results;
};

// Everything the entry links to - directly or through other linked entries - that has unpublished
// changes in at least one of `locales`. Only links that actually show in one of those locales
// count: a slide linked from a page's en-US field isn't the UK team's to publish.
export const getLinkedContent = async (
  cma: CMAClient,
  entryId: string,
  rootLocalizedFields: string[],
  options: LocaleOptions
): Promise<LinkedContent> => {
  const contentTypes = new Map<string, Promise<ContentTypeInfo>>();
  const getContentType = (contentTypeId: string) => {
    if (!contentTypes.has(contentTypeId)) {
      contentTypes.set(
        contentTypeId,
        cma.contentType.get({ contentTypeId }).then(contentType => ({
          localizedFields: new Set(contentType.fields.filter(field => field.localized).map(field => field.id)),
          displayField: contentType.displayField,
        }))
      );
    }
    return contentTypes.get(contentTypeId)!;
  };

  // Which of the root's locales each linked item is reachable through.
  const reach = new Map<string, { type: LinkType; locales: Set<string>; fieldIds: Set<string> }>();
  const entities = new Map<string, Entity>();
  let incomplete = false;

  // `rootFieldIds` is null for the root itself, whose own fields are the reference fields.
  const followLinks = (
    entity: Entity,
    localizedFields: Set<string>,
    entityLocales: Iterable<string>,
    rootFieldIds: Set<string> | null
  ) => {
    const grown = new Set<string>();
    for (const locale of entityLocales) {
      for (const [fieldId, field] of Object.entries(entity.fields ?? {})) {
        const links: Array<{ id: string; type: LinkType }> = [];
        collectLinks(fieldValueIn(field, locale, localizedFields.has(fieldId), options), links);

        for (const link of links) {
          if (link.id === entryId) continue;
          let linked = reach.get(link.id);
          if (!linked) {
            if (reach.size >= MAX_ITEMS) {
              incomplete = true;
              continue;
            }
            linked = { type: link.type, locales: new Set(), fieldIds: new Set() };
            reach.set(link.id, linked);
          }
          const viaFieldIds = rootFieldIds ?? [fieldId];
          const isNew =
            !linked.locales.has(locale) || [...viaFieldIds].some(viaFieldId => !linked!.fieldIds.has(viaFieldId));
          if (isNew) {
            linked.locales.add(locale);
            viaFieldIds.forEach(viaFieldId => linked!.fieldIds.add(viaFieldId));
            if (link.type === 'Entry') grown.add(link.id);
          }
        }
      }
    }
    return grown;
  };

  try {
    const root = (await cma.entry.get({ entryId })) as unknown as Entity;
    let frontier = followLinks(root, new Set(rootLocalizedFields), options.locales, null);

    for (let depth = 0; frontier.size > 0; depth++) {
      if (depth >= MAX_DEPTH) {
        incomplete = true;
        break;
      }

      const unfetched = [...frontier].filter(id => !entities.has(id));
      const fetched = await fetchInBatches(unfetched, batch =>
        cma.entry.getMany({ query: { 'sys.id[in]': batch.join(','), limit: batch.length } })
      );
      fetched.forEach(entity => entities.set(entity.sys.id, entity));

      // Entries that picked up a new locale are walked again, so their links in that locale count.
      const nextFrontier = new Set<string>();
      for (const id of frontier) {
        const entity = entities.get(id);
        const contentTypeId = entity?.sys.contentType?.sys.id;
        if (!entity || !contentTypeId) continue;
        const { localizedFields } = await getContentType(contentTypeId);
        const { locales, fieldIds } = reach.get(id)!;
        followLinks(entity, localizedFields, locales, fieldIds).forEach(grownId => nextFrontier.add(grownId));
      }
      frontier = nextFrontier;
    }

    const assetIds = [...reach].filter(([, linked]) => linked.type === 'Asset').map(([id]) => id);
    const assets = await fetchInBatches(assetIds, batch =>
      cma.asset.getMany({ query: { 'sys.id[in]': batch.join(','), limit: batch.length } })
    );
    assets.forEach(asset => entities.set(asset.sys.id, asset));
  } catch {
    incomplete = true;
  }

  const items: LinkedItem[] = [];
  for (const [id, linked] of reach) {
    const entity = entities.get(id);
    // Missing = deleted or not visible to this user; archived can't be published.
    if (!entity || entity.sys.archivedVersion) continue;

    const locales = options.locales.filter(locale => linked.locales.has(locale));
    if (!needsPublishIn(entity.sys, locales)) continue;

    let title: string | undefined;
    let isSharedContentType = false;
    if (linked.type === 'Entry') {
      const contentTypeId = entity.sys.contentType?.sys.id;
      const contentType = contentTypeId ? await getContentType(contentTypeId).catch(() => undefined) : undefined;
      isSharedContentType = !!contentType && contentType.localizedFields.size === 0;
      title = contentType?.displayField
        ? firstText(entity.fields[contentType.displayField], options.defaultLocale)
        : undefined;
    } else {
      const file = entity.fields.file?.[options.defaultLocale] as { fileName?: string } | undefined;
      title = firstText(entity.fields.title, options.defaultLocale) ?? file?.fileName;
    }

    items.push({
      id,
      type: linked.type,
      title: title ?? (linked.type === 'Asset' ? 'Untitled asset' : 'Untitled entry'),
      status: statusOf(entity.sys),
      locales,
      fieldIds: [...linked.fieldIds],
      version: entity.sys.version,
      isFirstPublish: !entity.sys.publishedVersion,
      isSharedContentType,
      createdBy: entity.sys.createdBy?.sys.id ?? null,
    });
  }

  return { items, incomplete };
};
