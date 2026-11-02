import { describe, expect, it } from 'vitest';
import {
  configuredSiteIds,
  findMalformedLocaleSites,
  parseLocaleSites,
  siteForLocale,
} from './localeSites';

describe('parseLocaleSites', () => {
  it('maps each locale to its site, ignoring whitespace', () => {
    expect(parseLocaleSites(' en-US = citizen_us ,en-GB=citizen_uk ')).toEqual({
      'en-US': 'citizen_us',
      'en-GB': 'citizen_uk',
    });
  });

  it('skips malformed entries and handles a missing value', () => {
    expect(parseLocaleSites('en-US=citizen_us, citizen_uk, =x, en-CA=')).toEqual({
      'en-US': 'citizen_us',
    });
    expect(parseLocaleSites(undefined)).toEqual({});
  });
});

describe('findMalformedLocaleSites', () => {
  it('names every entry that is not a single locale=site pair', () => {
    expect(findMalformedLocaleSites('en-US=citizen_us, citizen_uk, a=b=c, en-CA=')).toEqual([
      'citizen_uk',
      'a=b=c',
      'en-CA=',
    ]);
  });
});

describe('siteForLocale', () => {
  it('returns the mapped site, or undefined for an unmapped locale', () => {
    const value = 'en-US=citizen_us, en-GB=citizen_uk';
    expect(siteForLocale(value, 'en-GB')).toBe('citizen_uk');
    expect(siteForLocale(value, 'en-AU')).toBeUndefined();
  });
});

describe('configuredSiteIds', () => {
  it('lists each site once when locales share one', () => {
    expect(configuredSiteIds('en-US=citizen_us, es-US=citizen_us, en-GB=citizen_uk')).toEqual([
      'citizen_us',
      'citizen_uk',
    ]);
  });
});
