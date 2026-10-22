import { describe, expect, it } from 'vitest';
import { getAllowedLocales, getOwningRoles } from './permissions';

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

describe('getOwningRoles', () => {
  const membership = { admin: false, roles: [{ name: 'UK Editor' }, { name: 'Reviewer' }] };
  const roleLocaleMap = { 'UK Editor': ['en-GB'], 'US Editor': ['en-US'] };
  const parameters = {
    roleLocaleMap,
    roleMembers: { 'UK Editor': ['me', 'teammate'], 'US Editor': ['us-editor'], Reviewer: ['someone'] },
  };

  it('counts an entry the current user created, even without a saved member list', () => {
    expect(getOwningRoles(membership, { roleLocaleMap }, 'me', 'me')).toEqual(['UK Editor']);
  });

  it('counts an entry a teammate on the same role created', () => {
    expect(getOwningRoles(membership, parameters, 'teammate', 'me')).toEqual(['UK Editor']);
  });

  it("doesn't count another team's entry, or a shared role with no publishing locales", () => {
    expect(getOwningRoles(membership, parameters, 'us-editor', 'me')).toEqual([]);
    expect(getOwningRoles(membership, parameters, 'someone', 'me')).toEqual([]);
  });

  it("doesn't count a colleague when no member list has been saved yet", () => {
    expect(getOwningRoles(membership, { roleLocaleMap }, 'teammate', 'me')).toEqual([]);
  });

  it('returns nothing when the creator is unknown', () => {
    expect(getOwningRoles(membership, parameters, undefined, 'me')).toEqual([]);
  });
});
