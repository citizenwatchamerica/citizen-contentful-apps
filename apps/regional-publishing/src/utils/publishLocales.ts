import type { CMAClient } from '@contentful/app-sdk';

export const publishLocales = async (
  cma: CMAClient,
  entryId: string,
  version: number,
  locales: string[]
): Promise<void> => {
  // The `contentful-management` version this app's types come from (10.46.4) predates
  // selective-locale publish support: its `entry.publish` accepts only `{ entryId }` and
  // silently ignores any extra body, always doing a full publish across every locale. The
  // live Contentful API takes `locales` as a request param instead (added in 12.x) — the
  // native per-locale Publish button already relies on this, so it works today even though
  // our local types don't model it yet. Cast past the stale type rather than wait on a bump.
  await (cma.entry.publish as any)(
    { entryId, locales },
    { sys: { id: entryId, type: 'Entry', version } }
  );
};
