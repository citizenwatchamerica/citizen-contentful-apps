import type { CMAClient } from '@contentful/app-sdk';

interface LocalePublishBody {
  sys: { id: string; type: 'Entry'; version: number };
  add: { fields: { '*': string[] } };
}

export const publishLocales = async (
  cma: CMAClient,
  entryId: string,
  version: number,
  locales: string[]
): Promise<void> => {
  const body: LocalePublishBody = {
    sys: { id: entryId, type: 'Entry', version },
    add: { fields: { '*': locales } },
  };

  // contentful-management's typed `entry.publish` doesn't model the Enterprise-only
  // locale-scoped "add.fields" body yet — cast at the call boundary until it does.
  await cma.entry.publish({ entryId }, body as any);
};
