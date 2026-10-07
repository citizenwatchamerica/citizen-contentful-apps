import { describe, expect, it } from 'vitest';
import { getFieldExclusion, getValueExclusion } from './fieldEligibility';

const textField = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  type: 'Symbol',
  localized: true,
  ...overrides,
});

describe('getFieldExclusion', () => {
  it.each(['title', 'text', 'seoTitle', 'seoDescription', 'storeNameLine1', 'cardsTitle'])(
    'lets customer-facing copy field "%s" through',
    fieldId => {
      expect(getFieldExclusion(textField(fieldId))).toBeNull();
    }
  );

  it.each([
    ['internalName', 'Internal name'],
    ['categoryId', 'Identifier'],
    ['sku', 'SKU / model number'],
    ['slug', 'Slug'],
    ['externalLink', 'URL / link'],
    ['linkECom', 'URL / link'],
    ['sfccConnector', 'SFCC / connector configuration'],
    ['categoryCustomConnector', 'SFCC / connector configuration'],
    ['leftColumnWidth', 'Layout setting'],
    ['seoKeywords', 'SEO keywords'],
  ])('excludes structural field "%s"', (fieldId, reason) => {
    expect(getFieldExclusion(textField(fieldId))).toBe(reason);
  });

  it('excludes non-text, non-localized and disabled fields', () => {
    expect(getFieldExclusion(textField('image', { type: 'Link' }))).toMatch(/Not a text field/);
    expect(getFieldExclusion(textField('tags', { type: 'Array' }))).toMatch(/Not a text field/);
    expect(getFieldExclusion(textField('title', { localized: false }))).toBe('Not localized');
    expect(getFieldExclusion(textField('title', { disabled: true }))).toBe('Disabled or hidden field');
  });

  it('excludes fields edited by a custom app or a structured built-in editor', () => {
    expect(getFieldExclusion(textField('title'), { fieldId: 'title', widgetNamespace: 'app', widgetId: 'abc' })).toMatch(
      /custom app/
    );
    expect(getFieldExclusion(textField('title'), { fieldId: 'title', widgetNamespace: 'builtin', widgetId: 'dropdown' })).toMatch(
      /Structured editor/
    );
    expect(getFieldExclusion(textField('title'), { fieldId: 'title', widgetNamespace: 'builtin', widgetId: 'singleLine' })).toBeNull();
  });

  it('excludes fields whose help text marks them as system values', () => {
    expect(
      getFieldExclusion(textField('title'), { fieldId: 'title', settings: { helpText: 'System field - do not edit' } })
    ).toBe('Marked as system / do not edit');
  });

  it('excludes fields restricted to fixed values or a pattern', () => {
    expect(getFieldExclusion(textField('title', { validations: [{ in: ['left', 'right'] }] }))).toBe(
      'Fixed set of allowed values'
    );
    expect(getFieldExclusion(textField('title', { validations: [{ regexp: { pattern: '^x' } }] }))).toBe(
      'Pattern-validated value'
    );
  });
});

describe('getValueExclusion', () => {
  it.each(['https://www.bulova.com/ca', '/collections/marine-star', 'hello@bulova.com', 'BQ1046-58A', 'plp_hero_2'])(
    'excludes structural value "%s"',
    value => {
      expect(getValueExclusion(value)).not.toBeNull();
    }
  );

  it.each(["Women's Watches", 'Best Sellers', 'Shop the Collection', 'Precisionist', 'Up to 50% off'])(
    'lets copy "%s" through',
    value => {
      expect(getValueExclusion(value)).toBeNull();
    }
  );
});
