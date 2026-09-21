import { describe, expect, it } from 'vitest';
import {
  MAX_PRODUCT_SELECTION,
  canAddSelectedProduct,
  getProductSelectionLimitMessage,
} from './SearchPicker';

describe('product selection limits', () => {
  it('blocks adding a product once the storefront limit is reached', () => {
    const selected = Array.from({ length: MAX_PRODUCT_SELECTION }, (_, index) => `sku-${index}`);

    expect(canAddSelectedProduct('product', true, selected, 'sku-24')).toBe(false);
    expect(getProductSelectionLimitMessage('product', true, selected)).toContain('storefront');
    expect(getProductSelectionLimitMessage('product', true, selected)).toContain('24');
  });

  it('allows additional selections when the limit has not been reached', () => {
    const selected = ['sku-1', 'sku-2'];

    expect(canAddSelectedProduct('product', true, selected, 'sku-3')).toBe(true);
    expect(getProductSelectionLimitMessage('category', true, selected)).toBeUndefined();
  });
});
