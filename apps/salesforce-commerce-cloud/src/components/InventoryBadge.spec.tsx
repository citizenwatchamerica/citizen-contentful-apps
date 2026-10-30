import { describe, expect, it } from 'vitest';
import { getInventoryBadge } from './InventoryBadge';

describe('getInventoryBadge', () => {
  it('shows the available-to-sell count when stock is positive', () => {
    expect(getInventoryBadge({ ats: 1250, inStock: true })).toEqual({
      label: `${(1250).toLocaleString()} available`,
      variant: 'positive',
    });
  });

  it('flags zero or negative ats as out of stock', () => {
    expect(getInventoryBadge({ ats: 0, inStock: false })?.variant).toBe('negative');
    expect(getInventoryBadge({ ats: -2 })?.label).toBe('Out of stock');
  });

  it('shows nothing when inventory is unknown', () => {
    expect(getInventoryBadge(undefined)).toBeNull();
    expect(getInventoryBadge(null)).toBeNull();
    expect(getInventoryBadge({ inStock: true })).toBeNull();
  });
});
