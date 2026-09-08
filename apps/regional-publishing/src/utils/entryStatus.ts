import type { EntrySys } from '@contentful/app-sdk';
import type { EntityStatus } from '@contentful/f36-core';

// Mirrors Contentful's own status computation for an entry: archived takes priority, then no
// publishedVersion at all means it's never been published (draft), then a version further
// ahead than publishedVersion + 1 means there are edits since the last publish (changed) -
// otherwise the current draft matches what's published.
export const getEntryStatus = (sys: EntrySys): EntityStatus => {
  if (sys.archivedVersion) return 'archived';
  if (!sys.publishedVersion) return 'draft';
  if (sys.version > sys.publishedVersion + 1) return 'changed';
  return 'published';
};
