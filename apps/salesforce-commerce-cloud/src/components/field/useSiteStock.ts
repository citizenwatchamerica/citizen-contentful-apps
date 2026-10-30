import { useQuery } from '@tanstack/react-query';

import SfccClient, { ProductAvailability } from '../../utils/Sfcc';
import { AppInstallationParameters } from '../../locations/ConfigScreen';

// Product ID → stock on the field's site. Undefined while the request is in
// flight, after it failed, or when the locale has no site; badges are then left off.
export type SiteStock = Record<string, ProductAvailability> | undefined;

// One request covering every selected product, rather than one per product.
// Shared by all the cards on the field.
export const useSiteStock = (
  installParameters: AppInstallationParameters,
  siteId: string | undefined,
  productIds: string[],
  enabled: boolean
): SiteStock => {
  // Sorted so reordering cards by drag doesn't refetch.
  const ids = [...productIds].sort();

  const { data } = useQuery({
    queryKey: ['siteStock', siteId, ids],
    queryFn: () => new SfccClient(installParameters, siteId).fetchAvailabilityByProduct(ids),
    enabled: enabled && Boolean(siteId) && ids.length > 0,
    retry: false,
  });

  return data;
};
