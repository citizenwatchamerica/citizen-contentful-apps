import { describe, expect, it } from 'vitest';
import { getAllowedLocales } from './permissions';

const spaceLocales = ['en-US', 'en-GB', 'fr-CA'];

describe('getAllowedLocales', () => {
  it('returns every space locale for admins', () => {
    const result = getAllowedLocales({ admin: true, roles: [] }, null, spaceLocales);
    expect(result).toEqual(spaceLocales);
  });

  it('returns the mapped locales for a single matching role', () => {
    const membership = {
      admin: false,
      roles: [{ name: 'US Editor' }],
    };
    const parameters = { roleLocaleMap: { 'US Editor': ['en-US'] } };

    expect(getAllowedLocales(membership, parameters, spaceLocales)).toEqual(['en-US']);
  });

  it('unions locales across multiple roles', () => {
    const membership = {
      admin: false,
      roles: [{ name: 'US Editor' }, { name: 'UK Editor' }],
    };
    const parameters = {
      roleLocaleMap: { 'US Editor': ['en-US'], 'UK Editor': ['en-GB'] },
    };

    expect(getAllowedLocales(membership, parameters, spaceLocales)).toEqual(['en-US', 'en-GB']);
  });

  it('returns nothing when no role has a mapping', () => {
    const membership = {
      admin: false,
      roles: [{ name: 'US Editor' }],
    };

    expect(getAllowedLocales(membership, { roleLocaleMap: {} }, spaceLocales)).toEqual([]);
    expect(getAllowedLocales(membership, null, spaceLocales)).toEqual([]);
  });
});
