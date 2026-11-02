// The connector field is localized, and each Contentful locale is served by one
// SFCC site, so the site follows from the locale the editor is on. Configured as
// comma-separated pairs: "en-US=citizen_us, en-GB=citizen_uk".
export type LocaleSites = Record<string, string>;

const splitEntries = (value = ''): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseEntry = (entry: string): [string, string] | null => {
  const parts = entry.split('=').map((part) => part.trim());
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
};

export const parseLocaleSites = (value?: string): LocaleSites =>
  Object.fromEntries(
    splitEntries(value).flatMap((entry) => {
      const pair = parseEntry(entry);
      return pair ? [pair] : [];
    })
  );

// Entries that are not a single locale=site pair, for the config screen to name.
export const findMalformedLocaleSites = (value?: string): string[] =>
  splitEntries(value).filter((entry) => !parseEntry(entry));

export const siteForLocale = (value: string | undefined, locale: string): string | undefined =>
  parseLocaleSites(value)[locale];

// Every mapped site, once each. Several locales can share a site.
export const configuredSiteIds = (value?: string): string[] => [
  ...new Set(Object.values(parseLocaleSites(value))),
];
