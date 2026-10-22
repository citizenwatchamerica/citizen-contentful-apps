import React from 'react';
import { Badge, Flex } from '@contentful/f36-components';

import { ProductAvailability } from '../utils/Sfcc';

type BadgeVariant = 'positive' | 'negative';

interface InventoryBadgeInfo {
  label: string;
  variant: BadgeVariant;
}

// No ats means SFCC returned no inventory for this site (no record, or the
// lookup failed). Show nothing rather than a misleading zero.
export const getInventoryBadge = (
  availability?: ProductAvailability | null,
  siteId?: string
): InventoryBadgeInfo | null => {
  const ats = availability?.ats;
  if (typeof ats !== 'number') return null;

  const stock = ats > 0 ? `${ats.toLocaleString()} available` : 'Out of stock';

  return {
    label: siteId ? `${siteId}: ${stock}` : stock,
    variant: ats > 0 ? 'positive' : 'negative',
  };
};

// One badge per site that returned stock for the product, in configured site order.
export const getSiteStockBadges = (
  stockBySite: Record<string, Record<string, ProductAvailability> | undefined>,
  productId: string
): (InventoryBadgeInfo & { siteId: string })[] =>
  Object.entries(stockBySite).flatMap(([siteId, stock]) => {
    const badge = getInventoryBadge(stock?.[productId], siteId);
    return badge ? [{ siteId, ...badge }] : [];
  });

interface InventoryBadgeProps {
  availability?: ProductAvailability | null;
  className?: string;
}

const InventoryBadge = ({ availability, className }: InventoryBadgeProps) => {
  const badge = getInventoryBadge(availability);
  if (!badge) return null;

  return (
    <Badge variant={badge.variant} size="small" textTransform="none" className={className}>
      {badge.label}
    </Badge>
  );
};

interface SiteStockBadgesProps {
  stockBySite: Record<string, Record<string, ProductAvailability> | undefined>;
  productId: string;
  className?: string;
}

export const SiteStockBadges = ({ stockBySite, productId, className }: SiteStockBadgesProps) => {
  const badges = getSiteStockBadges(stockBySite, productId);
  if (!badges.length) return null;

  return (
    <Flex flexWrap="wrap" gap="spacing2Xs" className={className}>
      {badges.map((badge) => (
        <Badge key={badge.siteId} variant={badge.variant} size="small" textTransform="none">
          {badge.label}
        </Badge>
      ))}
    </Flex>
  );
};

export default InventoryBadge;
