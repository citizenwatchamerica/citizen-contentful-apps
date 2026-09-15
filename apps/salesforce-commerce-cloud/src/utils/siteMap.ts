import { FieldAppSDK } from '@contentful/app-sdk';

// Hidden companion field holding which site each category was selected under.
// Deliberately a fixed id rather than one derived from the connector field, so
// the setup instruction is the same string on every content type and both brands.
export const SITE_MAP_FIELD_ID = 'categoryCustomConnectorSites';

export type SiteMap = Record<string, string>;

// The companion field is absent until it has been added to the content type.
// Callers fall back to deriving the site from the category's catalog.
export const siteMapFieldExists = (sdk: FieldAppSDK): boolean =>
  Boolean(sdk.entry.fields[SITE_MAP_FIELD_ID]);

// Both fields are read and written at the connector field's own locale. Omitting
// it would silently land on the space's default locale instead.
export const readSiteMap = (sdk: FieldAppSDK): SiteMap => {
  const value = sdk.entry.fields[SITE_MAP_FIELD_ID]?.getValue(sdk.field.locale);
  return value && typeof value === 'object' ? (value as SiteMap) : {};
};

export const writeSiteMap = async (sdk: FieldAppSDK, siteMap: SiteMap): Promise<void> => {
  const field = sdk.entry.fields[SITE_MAP_FIELD_ID];
  if (!field) return;

  await field.setValue(siteMap, sdk.field.locale);
};

// Drops entries for categories no longer held by the connector field, so the map
// does not accumulate orphans as items are removed.
export const pruneSiteMap = (siteMap: SiteMap, keepIds: string[]): SiteMap =>
  Object.fromEntries(Object.entries(siteMap).filter(([id]) => keepIds.includes(id)));

// Drops a single category. Preferred over pruning to a keep-list on removal: the
// map is shared by every category connector field on the entry, so a keep-list
// built from one field would discard another field's entries.
export const removeFromSiteMap = (siteMap: SiteMap, categoryId: string): SiteMap => {
  const next = { ...siteMap };
  delete next[categoryId];

  return next;
};

// Contentful's JSON Object field type. Anything else cannot hold the map, and
// the write would fail at save time rather than at setup.
export const siteMapFieldTypeIsValid = (sdk: FieldAppSDK): boolean => {
  const field = sdk.entry.fields[SITE_MAP_FIELD_ID];
  if (!field) return true;

  return field.type === 'Object';
};

// The companion field must carry the same localization setting as the connector
// field, or values written on one locale surface on another.
export const siteMapLocalesMatch = (sdk: FieldAppSDK): boolean => {
  const companion = sdk.entry.fields[SITE_MAP_FIELD_ID];
  const connector = sdk.entry.fields[sdk.field.id];
  if (!companion || !connector) return true;

  return (
    companion.locales.length === connector.locales.length &&
    connector.locales.every((locale) => companion.locales.includes(locale))
  );
};
