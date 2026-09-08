import { describe, expect, it } from 'vitest';
import { getTranslationConfigs, parseRoleTranslationMap } from './permissions';

describe('getTranslationConfigs', () => {
  it('returns the configs for the first role that has any configured', () => {
    const configs = getTranslationConfigs(
      { admin: false, roles: [{ name: 'Merchants (US)' }] },
      { roleTranslationMap: JSON.stringify({ 'Merchants (US)': [{ source: 'en-US', target: 'es-US', guidance: '' }] }) }
    );

    expect(configs).toEqual([{ source: 'en-US', target: 'es-US', guidance: '' }]);
  });

  it('returns every rule when a role has more than one configured', () => {
    const configs = getTranslationConfigs(
      { admin: false, roles: [{ name: 'Merchants (CA)' }] },
      {
        roleTranslationMap: JSON.stringify({
          'Merchants (CA)': [
            { source: 'en-CA', target: 'fr-CA', guidance: 'quebec' },
            { source: 'en-US', target: 'en-CA', guidance: 'canadian english' },
          ],
        }),
      }
    );

    expect(configs).toEqual([
      { source: 'en-CA', target: 'fr-CA', guidance: 'quebec' },
      { source: 'en-US', target: 'en-CA', guidance: 'canadian english' },
    ]);
  });

  it('returns an empty array when the role has no configured rules, even for an admin', () => {
    const configs = getTranslationConfigs(
      { admin: true, roles: [{ name: 'Author (Global)' }] },
      { roleTranslationMap: '{}' }
    );

    expect(configs).toEqual([]);
  });

  it('falls back to Author (Global) for a space admin, since Contentful reports admins with an empty roles array', () => {
    const configs = getTranslationConfigs(
      { admin: true, roles: [] },
      { roleTranslationMap: JSON.stringify({ 'Author (Global)': [{ source: 'en-US', target: 'es-US', guidance: '' }] }) }
    );

    expect(configs).toEqual([{ source: 'en-US', target: 'es-US', guidance: '' }]);
  });

  it('does not apply the admin fallback for a non-admin with no matching role', () => {
    const configs = getTranslationConfigs(
      { admin: false, roles: [] },
      { roleTranslationMap: JSON.stringify({ 'Author (Global)': [{ source: 'en-US', target: 'es-US', guidance: '' }] }) }
    );

    expect(configs).toEqual([]);
  });

  it('ignores a rule with a blank source or target', () => {
    const configs = getTranslationConfigs(
      { admin: false, roles: [{ name: 'Merchants (UK)' }] },
      { roleTranslationMap: JSON.stringify({ 'Merchants (UK)': [{ source: 'en-US', target: '', guidance: '' }] }) }
    );

    expect(configs).toEqual([]);
  });

  it('returns an empty array when parameters are missing entirely', () => {
    const configs = getTranslationConfigs({ admin: false, roles: [{ name: 'Merchants (US)' }] }, null);

    expect(configs).toEqual([]);
  });
});

describe('parseRoleTranslationMap', () => {
  it('returns an empty map for undefined or malformed JSON instead of throwing', () => {
    expect(parseRoleTranslationMap(undefined)).toEqual({});
    expect(parseRoleTranslationMap('not json')).toEqual({});
  });

  it('normalizes a legacy single-object value into a one-element array', () => {
    expect(parseRoleTranslationMap('{"Merchants (US)":{"source":"en-US","target":"es-US","guidance":""}}')).toEqual({
      'Merchants (US)': [{ source: 'en-US', target: 'es-US', guidance: '' }],
    });
  });

  it('leaves an array value as-is', () => {
    expect(
      parseRoleTranslationMap(
        '{"Merchants (CA)":[{"source":"en-CA","target":"fr-CA","guidance":""},{"source":"en-US","target":"en-CA","guidance":""}]}'
      )
    ).toEqual({
      'Merchants (CA)': [
        { source: 'en-CA', target: 'fr-CA', guidance: '' },
        { source: 'en-US', target: 'en-CA', guidance: '' },
      ],
    });
  });
});
