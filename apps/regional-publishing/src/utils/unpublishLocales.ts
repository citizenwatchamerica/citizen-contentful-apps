import type { CMAClient } from '@contentful/app-sdk';

export const unpublishLocales = async (
  cma: CMAClient,
  entryId: string,
  version: number,
  locales: string[]
): Promise<void> => {
  // Same stale-type situation as publishLocales: 10.46.4's `entry.unpublish` doesn't model
  // `locales`, but the live API does. With `locales` it sends PUT /published with
  // `remove.fields` (only those locales are unpublished, and it needs the version); without
  // them it would DELETE /published and take down every locale, which is why an empty list
  // must never reach here.
  await (cma.entry.unpublish as any)(
    { entryId, locales },
    { sys: { id: entryId, type: 'Entry', version } }
  );
};

// Whole-entry unpublish (DELETE /published). Contentful rejects `remove.fields` for the default
// locale while other locales stay published, so when a selection covers every published locale
// this is the call that works - and it ends in the same state anyway.
export const unpublishEntry = async (cma: CMAClient, entryId: string): Promise<void> => {
  await cma.entry.unpublish({ entryId });
};
