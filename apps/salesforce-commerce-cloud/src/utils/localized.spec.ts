import { describe, expect, it } from 'vitest';
import { getLocalizedValue } from './localized';

describe('getLocalizedValue', () => {
  it('returns the default value when it is set', () => {
    expect(getLocalizedValue({ default: 'Men', 'en-GB': 'Gents' }, 'en-GB')).toBe('Men');
  });

  it("falls back to the field's locale when the default is blank", () => {
    expect(getLocalizedValue({ default: '', fr: 'Hommes', 'en-GB': 'Gents' }, 'en-GB')).toBe(
      'Gents'
    );
  });

  it('matches an SFCC underscore locale to a Contentful hyphen locale', () => {
    expect(getLocalizedValue({ fr: 'Hommes', en_GB: 'Gents' }, 'en-GB')).toBe('Gents');
  });

  it('falls back to the first non-empty value when no locale matches', () => {
    expect(getLocalizedValue({ default: '', 'en-GB': 'Gents' }, 'de-DE')).toBe('Gents');
    expect(getLocalizedValue({ 'en-GB': '', fr: 'Hommes' })).toBe('Hommes');
  });

  it('returns undefined when there is no value in any locale', () => {
    expect(getLocalizedValue(undefined, 'en-GB')).toBeUndefined();
    expect(getLocalizedValue({ default: '', 'en-GB': '' }, 'en-GB')).toBeUndefined();
  });
});
