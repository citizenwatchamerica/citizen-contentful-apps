import { describe, expect, it, vi } from 'vitest';
import { unpublishEntry, unpublishLocales } from './unpublishLocales';

describe('unpublishEntry', () => {
  it('unpublishes the whole entry without a locale list', async () => {
    const cma: any = { entry: { unpublish: vi.fn().mockResolvedValue(undefined) } };

    await unpublishEntry(cma, 'entry-1');

    expect(cma.entry.unpublish).toHaveBeenCalledWith({ entryId: 'entry-1' });
  });
});

describe('unpublishLocales', () => {
  it('unpublishes only the given locales at the current entry version', async () => {
    const cma: any = { entry: { unpublish: vi.fn().mockResolvedValue(undefined) } };

    await unpublishLocales(cma, 'entry-1', 7, ['en-US', 'en-CA']);

    expect(cma.entry.unpublish).toHaveBeenCalledWith(
      { entryId: 'entry-1', locales: ['en-US', 'en-CA'] },
      { sys: { id: 'entry-1', type: 'Entry', version: 7 } }
    );
  });
});
