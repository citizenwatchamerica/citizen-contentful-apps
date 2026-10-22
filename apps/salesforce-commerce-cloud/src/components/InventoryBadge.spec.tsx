import { describe, expect, it } from 'vitest';
import { getInventoryBadge, getSiteStockBadges } from './InventoryBadge';

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

describe('getSiteStockBadges', () => {
  it('labels each site and keeps the configured site order', () => {
    const stockBySite = {
      bulova: { '96B482': { ats: 66, inStock: true } },
      bulova_ca: { '96B482': { ats: 0, inStock: false } },
    };

    expect(getSiteStockBadges(stockBySite, '96B482')).toEqual([
      { siteId: 'bulova', label: 'bulova: 66 available', variant: 'positive' },
      { siteId: 'bulova_ca', label: 'bulova_ca: Out of stock', variant: 'negative' },
    ]);
  });

  it('leaves out sites that are still loading, failed, or did not return the product', () => {
    const stockBySite = {
      bulova: { '96B482': { ats: 3 } },
      bulova_ca: undefined,
      bulova_mx: {},
    };

    expect(getSiteStockBadges(stockBySite, '96B482').map((badge) => badge.siteId)).toEqual([
      'bulova',
    ]);
  });
});
