import { describe, expect, it } from 'vitest';
import { getTranslationConfig, parseRoleTranslationMap } from './permissions';

describe('getTranslationConfig', () => {
  it('returns the config for the first role that has one configured', () => {
    const config = getTranslationConfig(
      { admin: false, roles: [{ name: 'Merchants (US)' }] },
      { roleTranslationMap: JSON.stringify({ 'Merchants (US)': { source: 'en-US', target: 'es-US', guidance: '' } }) }
    );

    expect(config).toEqual({ source: 'en-US', target: 'es-US', guidance: '' });
  });

  it('returns null when the role has no configured pair, even for an admin', () => {
    const config = getTranslationConfig(
      { admin: true, roles: [{ name: 'Author (Global)' }] },
      { roleTranslationMap: '{}' }
    );

    expect(config).toBeNull();
  });

  it('returns null when source or target is blank', () => {
    const config = getTranslationConfig(
      { admin: false, roles: [{ name: 'Merchants (UK)' }] },
      { roleTranslationMap: JSON.stringify({ 'Merchants (UK)': { source: 'en-US', target: '', guidance: '' } }) }
    );

    expect(config).toBeNull();
  });

  it('returns null when parameters are missing entirely', () => {
    const config = getTranslationConfig({ admin: false, roles: [{ name: 'Merchants (US)' }] }, null);

    expect(config).toBeNull();
  });
});

describe('parseRoleTranslationMap', () => {
  it('returns an empty map for undefined or malformed JSON instead of throwing', () => {
    expect(parseRoleTranslationMap(undefined)).toEqual({});
    expect(parseRoleTranslationMap('not json')).toEqual({});
  });

  it('parses a valid JSON string into the map', () => {
    expect(parseRoleTranslationMap('{"Merchants (US)":{"source":"en-US","target":"es-US","guidance":""}}')).toEqual({
      'Merchants (US)': { source: 'en-US', target: 'es-US', guidance: '' },
    });
  });
});
