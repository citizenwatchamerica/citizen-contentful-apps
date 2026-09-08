import { describe, expect, it } from 'vitest';
import { getEntryStatus } from './entryStatus';

const baseSys = { version: 1 } as any;

describe('getEntryStatus', () => {
  it('is draft when the entry has never been published', () => {
    expect(getEntryStatus({ ...baseSys, version: 1 })).toBe('draft');
  });

  it('is published when the current version matches what was published', () => {
    expect(getEntryStatus({ ...baseSys, version: 4, publishedVersion: 3 })).toBe('published');
  });

  it('is changed when there are edits since the last publish', () => {
    expect(getEntryStatus({ ...baseSys, version: 6, publishedVersion: 3 })).toBe('changed');
  });

  it('is archived regardless of publish state', () => {
    expect(getEntryStatus({ ...baseSys, version: 4, publishedVersion: 3, archivedVersion: 5 })).toBe('archived');
  });
});
