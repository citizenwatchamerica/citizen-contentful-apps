import React from 'react';
import { Badge } from '@contentful/f36-components';

import { ProductAvailability } from '../utils/Sfcc';

type BadgeVariant = 'positive' | 'negative';

interface InventoryBadgeInfo {
  label: string;
  variant: BadgeVariant;
}

// No ats means SFCC returned no inventory for this site (no record, or the
// lookup failed). Show nothing rather than a misleading zero.
export const getInventoryBadge = (
  availability?: ProductAvailability | null
): InventoryBadgeInfo | null => {
  const ats = availability?.ats;
  if (typeof ats !== 'number') return null;

  return {
    label: ats > 0 ? `${ats.toLocaleString()} available` : 'Out of stock',
    variant: ats > 0 ? 'positive' : 'negative',
  };
};

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

export default InventoryBadge;
