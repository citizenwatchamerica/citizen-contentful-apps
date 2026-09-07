import type { CMAClient } from '@contentful/app-sdk';
import type { EntityStatus } from '@contentful/f36-core';

export type LocaleStatus = Extract<EntityStatus, 'published' | 'changed' | 'draft'>;

export const getLocaleStatuses = async (
  cma: CMAClient,
  entryId: string,
  locales: string[]
): Promise<Record<string, LocaleStatus>> => {
  try {
    const entry = await cma.entry.get({ entryId });
    // `sys.fieldStatus` isn't modeled in this app's contentful-management types yet, but the
    // live API already returns it — it's what drives Contentful's own native per-locale
    // status pills, and a locale missing from the map means it has never been published.
    const fieldStatus = (entry as { sys?: { fieldStatus?: { '*'?: Record<string, string> } } }).sys
      ?.fieldStatus?.['*'];

    const statuses: Record<string, LocaleStatus> = {};
    for (const locale of locales) {
      statuses[locale] = (fieldStatus?.[locale] as LocaleStatus | undefined) ?? 'draft';
    }
    return statuses;
  } catch {
    // Status is a nice-to-have; never block publishing just because it couldn't be fetched.
    return {};
  }
};
