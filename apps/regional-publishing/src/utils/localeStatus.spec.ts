import { describe, expect, it, vi } from 'vitest';
import { getLocaleStatuses } from './localeStatus';

describe('getLocaleStatuses', () => {
  it('maps each requested locale to its fieldStatus entry, defaulting missing ones to draft', async () => {
    const cma = {
      entry: {
        get: vi.fn().mockResolvedValue({
          sys: { fieldStatus: { '*': { 'en-US': 'changed', en: 'published' } } },
        }),
      },
    };

    const result = await getLocaleStatuses(cma as any, 'entry-1', ['en', 'en-US', 'en-GB']);

    expect(result).toEqual({ en: 'published', 'en-US': 'changed', 'en-GB': 'draft' });
  });

  it('treats every locale as draft when the entry has never been published', async () => {
    const cma = { entry: { get: vi.fn().mockResolvedValue({ sys: {} }) } };

    const result = await getLocaleStatuses(cma as any, 'entry-1', ['en-US']);

    expect(result).toEqual({ 'en-US': 'draft' });
  });

  it('returns an empty map instead of throwing when the fetch fails', async () => {
    const cma = { entry: { get: vi.fn().mockRejectedValue(new Error('network error')) } };

    const result = await getLocaleStatuses(cma as any, 'entry-1', ['en-US']);

    expect(result).toEqual({});
  });
});
