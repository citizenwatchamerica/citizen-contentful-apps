import { useQueries } from '@tanstack/react-query';

import SfccClient, { ProductAvailability } from '../../utils/Sfcc';
import { AppInstallationParameters } from '../../locations/ConfigScreen';

// Site ID → product ID → stock. A site is undefined while its request is in
// flight or after it failed; its badges are then simply left off.
export type StockBySite = Record<string, Record<string, ProductAvailability> | undefined>;

// One request per configured site covering every selected product, rather than
// one per product per site. Shared by all the cards on the field.
export const useStockBySite = (
  installParameters: AppInstallationParameters,
  siteIds: string[],
  productIds: string[],
  enabled: boolean
): StockBySite => {
  // Sorted so reordering cards by drag doesn't refetch.
  const ids = [...productIds].sort();

  const results = useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: ['stockBySite', siteId, ids],
      queryFn: () => new SfccClient(installParameters, siteId).fetchAvailabilityByProduct(ids),
      enabled: enabled && ids.length > 0,
      retry: false,
    })),
  });

  return Object.fromEntries(siteIds.map((siteId, index) => [siteId, results[index].data]));
};
