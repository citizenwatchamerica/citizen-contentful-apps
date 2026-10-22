// SCAPI admin APIs return localized attributes as one value per SFCC locale,
// e.g. { default: 'Men', 'en-GB': 'Men' }.
export type LocalizedString = Record<string, string | undefined>;

// SFCC writes locales as en_GB and Contentful as en-GB, so compare them loosely.
const normalizeLocale = (locale: string) => locale.replace('_', '-').toLowerCase();

// A value can be filled in for a site's locale while the default stays blank in
// Business Manager, so fall back to the field's locale, then to any locale that
// has a value, before giving up.
export const getLocalizedValue = (
  value: LocalizedString | undefined,
  locale?: string
): string | undefined => {
  if (!value) return undefined;
  if (value.default) return value.default;

  if (locale) {
    const target = normalizeLocale(locale);
    const match = Object.keys(value).find((key) => normalizeLocale(key) === target);
    if (match && value[match]) return value[match];
  }

  return Object.values(value).find(Boolean);
};
